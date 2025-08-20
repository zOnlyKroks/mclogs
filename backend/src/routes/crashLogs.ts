import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../services/database'
import { CrashParser } from '../services/crashParser'
import { AuthService } from '../services/auth'
import rateLimit from 'express-rate-limit'
import type { AuthenticatedRequest } from '../models/User'

function sanitizeContent(content: string): string {
  return content
    // Redact IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[REDACTED_IP]')
    // Redact URLs - everything after protocol
    .replace(/(https?:\/\/)[^\s\]]+/g, '$1[REDACTED_URL]')
    // Redact file paths that might contain usernames
    .replace(/\/Users\/[^\/\s]+/g, '/Users/[REDACTED_USER]')
    .replace(/C:\\Users\\[^\\\/\s]+/g, 'C:\\Users\\[REDACTED_USER]')
    // Redact common username patterns in logs
    .replace(/User:\s*[^\s\[\]]+/gi, 'User: [REDACTED_USER]')
    .replace(/Player:\s*[^\s\[\]]+/gi, 'Player: [REDACTED_USER]')
    .replace(/Username:\s*[^\s\[\]]+/gi, 'Username: [REDACTED_USER]')
    // Redact email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
}

const router = Router()

// Rate limiting
const createRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many paste submissions, try again later.' }
})

const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many search requests, try again later.' }
})

router.post('/', createRateLimit, AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { files, title, description } = req.body

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'At least one log file is required' })
    }

    if (files.length > 10) {
      return res.status(400).json({ error: 'Too many files (max 10)' })
    }

    let totalSize = 0
    const processedFiles = files.map((file: any) => {
      if (!file.name || !file.content || !file.type) {
        throw new Error('Invalid file format')
      }
      
      if (file.content.length > 2000000) {
        throw new Error(`File ${file.name} is too large (max 2MB per file)`)
      }
      
      totalSize += file.content.length
      
      return {
        name: file.name.substring(0, 100),
        content: sanitizeContent(file.content),
        type: file.type,
        size: file.content.length
      }
    })

    if (totalSize > 5000000) {
      return res.status(400).json({ error: 'Total file size too large (max 5MB)' })
    }

    const id = uuidv4()
    const userId = req.user!.id
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    
    const userLogCount = await database.getUserCrashLogCount(userId)
    
    if (userLogCount >= 10) {
      await database.deleteOldestUserCrashLog(userId)
    }

    // Parse the primary log file (latest.log or first crash file)
    const primaryFile = processedFiles.find(f => f.type === 'latest') || processedFiles[0]
    const parsedData = CrashParser.parse(primaryFile.content)

    const crashLog = {
      id,
      title: title?.substring(0, 200) || `Log Report ${new Date().toISOString().split('T')[0]}`,
      files: processedFiles,
      description: description?.substring(0, 1000),
      ...parsedData,
      userId,
      ipAddress: '[REDACTED]',
      userAgent: req.get('User-Agent'),
      expiresAt
    }

    await database.createCrashLog(crashLog)

    res.status(201).json({
      id,
      url: `/crash/${id}`,
      expiresAt,
      fileCount: processedFiles.length
    })
  } catch (error) {
    console.error('Error creating crash log:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid ID' })
    }

    const crashLog = await database.getCrashLog(id)

    if (!crashLog) {
      return res.status(404).json({ error: 'Crash log not found' })
    }

    // Check if expired
    if (crashLog.expiresAt && new Date() > crashLog.expiresAt) {
      return res.status(410).json({ error: 'Crash log has expired' })
    }

    res.json(crashLog)
  } catch (error) {
    console.error('Error retrieving crash log:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params
    const user = req.user!

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid crash log ID' })
    }

    const deleted = await database.deleteCrashLog(id, user.id)
    
    if (!deleted) {
      return res.status(404).json({ error: 'Crash log not found or not authorized to delete' })
    }

    res.json({ message: 'Crash log deleted successfully' })
  } catch (error) {
    console.error('Error deleting crash log:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/', searchRateLimit, async (req, res) => {
  try {
    const {
      q,
      minecraftVersion,
      modLoader,
      errorType,
      mod,
      limit = 20,
      offset = 0
    } = req.query

    const searchParams = {
      q: q as string,
      minecraftVersion: minecraftVersion as string,
      modLoader: modLoader as string,
      errorType: errorType as string,
      mod: mod as string,
      limit: Math.min(Number(limit) || 20, 100),
      offset: Number(offset) || 0
    }

    const crashLogs = await database.searchCrashLogs(searchParams)

    const sanitizedLogs = crashLogs.map(log => ({
      id: log.id,
      title: log.title,
      description: log.description?.substring(0, 200),
      minecraftVersion: log.minecraftVersion,
      modLoader: log.modLoader,
      modLoaderVersion: log.modLoaderVersion,
      errorType: log.errorType,
      errorMessage: log.errorMessage?.substring(0, 200),
      modList: log.modList?.slice(0, 10),
      fileCount: log.files?.length || 0,
      createdAt: log.createdAt,
    }))

    res.json({
      results: sanitizedLogs,
      totalResults: crashLogs.length,
      params: searchParams
    })
  } catch (error) {
    console.error('Error searching crash logs:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
