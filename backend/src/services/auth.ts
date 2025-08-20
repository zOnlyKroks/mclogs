import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import jwt from 'jsonwebtoken'
import { database } from './database'
import type { User } from '../models/User'
import express from 'express'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'

export class AuthService {
  static initializePassport() {
    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID environment variable is required')
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_SECRET environment variable is required')
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

  static verifyJWT(token: string): User | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      return {
        id: decoded.id,
        googleId: decoded.googleId,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        createdAt: new Date(), // We don't store these in JWT
        lastLogin: new Date()
      }
    } catch {
      return null
    }
  }

  static requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const user = AuthService.verifyJWT(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    req.user = user
    next()
  }

  static optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    if (token) {
      const user = AuthService.verifyJWT(token)
      if (user) {
        req.user = user
      }
    }

    next()
  }
}