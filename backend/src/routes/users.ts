import { Router } from 'express'
import { database } from '../services/database'
import { AuthService } from '../services/auth'
import type { AuthenticatedRequest } from '../models/User'

const router = Router()

// Get user's crash logs
router.get('/me/crash-logs', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!
    const crashLogs = await database.getUserCrashLogs(user.id)
    
    // Return sanitized version without sensitive data
    const sanitizedLogs = crashLogs.map(log => ({
      id: log.id,
      title: log.title,
      description: log.description,
      minecraftVersion: log.minecraftVersion,
      modLoader: log.modLoader,
      modLoaderVersion: log.modLoaderVersion,
      errorType: log.errorType,
      errorMessage: log.errorMessage?.substring(0, 200),
      culpritMod: log.culpritMod,
      fileCount: log.files?.length || 0,
      createdAt: log.createdAt,
      expiresAt: log.expiresAt,
      tags: log.tags
    }))

    res.json({ crashLogs: sanitizedLogs })
  } catch (error) {
    console.error('Error retrieving user crash logs:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user's recent comments (last 30 days)
router.get('/me/recent-comments', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!
    const days = parseInt(req.query.days as string) || 30
    
    if (days > 365 || days < 1) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' })
    }

    const recentComments = await database.getUserRecentComments(user.id, days)
    res.json({ comments: recentComments, days })
  } catch (error) {
    console.error('Error retrieving user recent comments:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user dashboard summary
router.get('/me/dashboard', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!
    
    // Get crash logs
    const crashLogs = await database.getUserCrashLogs(user.id)
    
    // Get recent comments (last 30 days)
    const recentComments = await database.getUserRecentComments(user.id, 30)
    
    // Calculate some stats
    const activeLogs = crashLogs.filter(log => !log.expiresAt || new Date() <= log.expiresAt)
    const expiredLogs = crashLogs.filter(log => log.expiresAt && new Date() > log.expiresAt)
    
    const sanitizedLogs = crashLogs.map(log => ({
      id: log.id,
      title: log.title,
      description: log.description,
      minecraftVersion: log.minecraftVersion,
      modLoader: log.modLoader,
      errorType: log.errorType,
      errorMessage: log.errorMessage?.substring(0, 200),
      culpritMod: log.culpritMod,
      fileCount: log.files?.length || 0,
      createdAt: log.createdAt,
      expiresAt: log.expiresAt,
      isExpired: log.expiresAt ? new Date() > log.expiresAt : false
    }))

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      stats: {
        totalCrashLogs: crashLogs.length,
        activeCrashLogs: activeLogs.length,
        expiredCrashLogs: expiredLogs.length,
        recentComments: recentComments.length
      },
      crashLogs: sanitizedLogs,
      recentComments: recentComments.slice(0, 10) // Latest 10 comments
    })
  } catch (error) {
    console.error('Error retrieving user dashboard:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router