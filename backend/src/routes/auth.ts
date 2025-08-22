import { Router } from 'express'
import passport from 'passport'
import { AuthService } from '../services/auth'
import { database } from '../services/database'
import express from 'express'

declare global {
  namespace Express {
    interface User {
      id: string;
      googleId: string;
      email: string;
      name: string;
      picture?: string;
      createdAt: Date;
      lastLogin: Date;
    }
  }
}

const router = Router()

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

// Google OAuth2 callback
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req: express.Request, res: express.Response) => {
    try {
      const user = req.user
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=auth_failed`)
      }
      
      const token = AuthService.generateJWT(user)
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?token=${token}`)
    } catch (error) {
      console.error('Auth callback error:', error)
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=auth_failed`)
    }
  }
)

// Get current user info
router.get('/me', AuthService.requireAuth, (req: express.Request, res: express.Response) => {
  const user = req.user!
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture
    }
  })
})

// Create anonymous session
router.post('/session', async (req: express.Request, res: express.Response) => {
  try {
    const session = await AuthService.createSession(req)
    const token = AuthService.generateSessionToken(session)
    
    res.json({
      sessionId: session.id,
      token,
      expiresAt: session.expiresAt,
      isAnonymous: true
    })
  } catch (error) {
    console.error('Session creation error:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

// Claim anonymous session after authentication
router.post('/claim', AuthService.requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const user = req.user!
    const { sessionId } = req.body
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' })
    }
    
    // Verify session exists and is not already claimed
    const session = await database.findSessionById(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' })
    }
    
    if (session.claimedBy) {
      return res.status(409).json({ error: 'Session already claimed' })
    }
    
    // Claim the session and transfer logs
    await database.claimSession(sessionId, user.id)
    
    // Get the count of transferred logs
    const transferredLogCount = await database.getUserCrashLogCount(user.id)
    
    res.json({ 
      message: 'Session claimed successfully',
      transferredLogs: transferredLogCount
    })
  } catch (error) {
    console.error('Session claim error:', error)
    res.status(500).json({ error: 'Failed to claim session' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' })
})

export default router
