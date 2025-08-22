import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import jwt from 'jsonwebtoken'
import { database } from './database'
import type { User } from '../models/User'
import type { Session, SessionData } from '../models/Session'
import express from 'express'
import crypto from 'crypto'

declare global {
  namespace Express {
    interface Request {
      userSession?: Session;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'

export class AuthService {
  static initializePassport() {
    // Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.warn('Google OAuth not configured - authentication will be disabled')
      console.warn('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables to enable authentication')
      return
    }

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await database.findUserByGoogleId(profile.id)
            
            if (!user) {
              // Create new user
              user = await database.createUser({
                googleId: profile.id,
                email: profile.emails?.[0]?.value || '',
                name: profile.displayName || '',
                picture: profile.photos?.[0]?.value
              })
            } else {
              // Update last login
              await database.updateUserLastLogin(user.id)
            }
            
            return done(null, user)
          } catch (error) {
            return done(error as Error, undefined)
          }
        }
      )
    )

    passport.serializeUser((user: any, done) => {
      done(null, user.id)
    })

    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await database.findUserByGoogleId(id)
        done(null, user)
      } catch (error) {
        done(error, null)
      }
    })
  }

  static generateJWT(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
  }

  static async verifyJWT(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      
      // Get the full user data from database with correct createdAt and lastLogin
      const user = await database.findUserByGoogleId(decoded.googleId)
      if (!user) {
        return null
      }
      
      return user
    } catch {
      return null
    }
  }

  // Session token methods for anonymous users
  static generateBrowserFingerprint(req: express.Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.ip || req.connection.remoteAddress || ''
    ]
    return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 32)
  }

  static async createSession(req: express.Request): Promise<Session> {
    const fingerprint = this.generateBrowserFingerprint(req)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    
    const session = await database.createSession({
      fingerprint,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || '',
      expiresAt
    })

    return session
  }

  static generateSessionToken(session: Session): string {
    return jwt.sign(
      {
        sessionId: session.id,
        fingerprint: session.fingerprint,
        type: 'session'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    )
  }

  static async verifySessionToken(token: string): Promise<Session | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      
      if (decoded.type !== 'session') {
        return null
      }
      
      const session = await database.findSessionById(decoded.sessionId)
      if (!session) {
        return null
      }
      
      // Update last used timestamp
      await database.updateSessionLastUsed(session.id)
      
      return session
    } catch {
      return null
    }
  }

  static async getSessionData(req: express.Request): Promise<SessionData | null> {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    
    if (!token) {
      return null
    }

    // Try JWT token first (registered users)
    const user = await this.verifyJWT(token)
    if (user) {
      return {
        sessionId: user.id,
        fingerprint: this.generateBrowserFingerprint(req),
        isAuthenticated: true,
        user
      }
    }

    // Try session token (anonymous users)
    const session = await this.verifySessionToken(token)
    if (session) {
      return {
        sessionId: session.id,
        fingerprint: session.fingerprint,
        isAuthenticated: false
      }
    }

    return null
  }

  static async requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const user = await AuthService.verifyJWT(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    req.user = user
    next()
  }

  static async requireAuthOrSession(req: express.Request, res: express.Response, next: express.NextFunction) {
    const sessionData = await AuthService.getSessionData(req)
    
    if (sessionData) {
      if (sessionData.isAuthenticated) {
        req.user = sessionData.user
      }
      req.userSession = { id: sessionData.sessionId } as Session
      return next()
    }

    // Create anonymous session if no token provided
    const session = await AuthService.createSession(req)
    const token = AuthService.generateSessionToken(session)
    
    req.userSession = session
    res.setHeader('X-Session-Token', token)
    next()
  }

  static async optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const sessionData = await AuthService.getSessionData(req)
    
    if (sessionData) {
      if (sessionData.isAuthenticated) {
        req.user = sessionData.user
      }
      req.userSession = { id: sessionData.sessionId } as Session
    }

    next()
  }
}