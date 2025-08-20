import { Router } from 'express'
import passport from 'passport'
import { AuthService } from '../services/auth'
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

// Logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' })
})

export default router
