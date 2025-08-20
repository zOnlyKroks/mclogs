import { Router } from 'express'
import { database } from '../services/database'
import { AuthService } from '../services/auth'
import rateLimit from 'express-rate-limit'
import type { AuthenticatedRequest } from '../models/User'

const router = Router()

// Rate limiting for comments
const commentRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 comments per 5 minutes
  message: { error: 'Too many comments posted, try again later.' }
})

// Get comments for a crash log
router.get('/crash/:crashLogId', async (req, res) => {
  try {
    const { crashLogId } = req.params

    if (!crashLogId || typeof crashLogId !== 'string') {
      return res.status(400).json({ error: 'Invalid crash log ID' })
    }

    // Check if crash log exists
    const crashLog = await database.getCrashLog(crashLogId)
    if (!crashLog) {
      return res.status(404).json({ error: 'Crash log not found' })
    }

    const comments = await database.getCommentsByCrashLogId(crashLogId)
    res.json({ comments })
  } catch (error) {
    console.error('Error retrieving comments:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create a new comment
router.post('/crash/:crashLogId', commentRateLimit, AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { crashLogId } = req.params
    const { content } = req.body
    const user = req.user!

    if (!crashLogId || typeof crashLogId !== 'string') {
      return res.status(400).json({ error: 'Invalid crash log ID' })
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' })
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Comment is too long (max 2000 characters)' })
    }

    // Check if crash log exists and hasn't expired
    const crashLog = await database.getCrashLog(crashLogId)
    if (!crashLog) {
      return res.status(404).json({ error: 'Crash log not found' })
    }

    if (crashLog.expiresAt && new Date() > crashLog.expiresAt) {
      return res.status(410).json({ error: 'Cannot comment on expired crash log' })
    }

    const comment = await database.createComment({
      crashLogId,
      userId: user.id,
      userName: user.name,
      userPicture: user.picture,
      content: content.trim()
    })

    res.status(201).json({ comment })
  } catch (error) {
    console.error('Error creating comment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update a comment
router.put('/:commentId', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { commentId } = req.params
    const { content } = req.body
    const user = req.user!

    if (!commentId || typeof commentId !== 'string') {
      return res.status(400).json({ error: 'Invalid comment ID' })
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' })
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Comment is too long (max 2000 characters)' })
    }

    const updated = await database.updateComment(commentId, content.trim(), user.id)
    
    if (!updated) {
      return res.status(404).json({ error: 'Comment not found or not authorized to update' })
    }

    res.json({ message: 'Comment updated successfully' })
  } catch (error) {
    console.error('Error updating comment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete a comment
router.delete('/:commentId', AuthService.requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { commentId } = req.params
    const user = req.user!

    if (!commentId || typeof commentId !== 'string') {
      return res.status(400).json({ error: 'Invalid comment ID' })
    }

    const deleted = await database.deleteComment(commentId, user.id)
    
    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found or not authorized to delete' })
    }

    res.json({ message: 'Comment deleted successfully' })
  } catch (error) {
    console.error('Error deleting comment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router