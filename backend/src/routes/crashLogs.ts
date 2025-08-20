import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../services/database'
import { CrashParser } from '../services/crashParser'
import { AuthService } from '../services/auth'
import rateLimit from 'express-rate-limit'
import type { AuthenticatedRequest } from '../models/User'

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

router.post('/', createRateLimit, AuthService.optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { content, title } = req.body

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' })
    }

    if (content.length > 1000000) {
      return res.status(400).json({ error: 'Content too large' })
    }

    const id = uuidv4()
    const parsedData = CrashParser.parse(content)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    let userId: string | undefined
    if (req.user) {
      userId = req.user.id
      
      const userLogCount = await database.getUserCrashLogCount(userId)
      
      if (userLogCount >= 10) {
        await database.deleteOldestUserCrashLog(userId)
      }
    }

    const crashLog = {
      id,
      title: title?.substring(0, 200) || `Crash ${new Date().toISOString().split('T')[0]}`,
      content,
      ...parsedData,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      expiresAt
    }

    await database.createCrashLog(crashLog)

    res.status(201).json({
      id,
      url: `/crash/${id}`,
      expiresAt
    })
  } catch (error) {
    console.error('Error creating crash log:', error)
    res.status(500).json({ error: 'Internal server error' })
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
      minecraftVersion: log.minecraftVersion,
      modLoader: log.modLoader,
      modLoaderVersion: log.modLoaderVersion,
      errorType: log.errorType,
      errorMessage: log.errorMessage?.substring(0, 200),
      modList: log.modList?.slice(0, 10),
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