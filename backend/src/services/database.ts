import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import { CrashLog, CrashLogSearchParams } from '../models/CrashLog'
import { User } from '../models/User'

export class Database {
  private db: sqlite3.Database

  constructor(dbPath: string = './crashes.db') {
    this.db = new sqlite3.Database(dbPath)
    this.init()
  }

  private async init() {
    const run = promisify(this.db.run.bind(this.db))
    
    await run(`
      CREATE TABLE IF NOT EXISTS crash_logs (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT NOT NULL,
        minecraft_version TEXT,
        mod_loader TEXT,
        mod_loader_version TEXT,
        mod_list TEXT,  -- JSON array as string
        error_type TEXT,
        error_message TEXT,
        stack_trace TEXT,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        tags TEXT  -- JSON array as string
      )
    `)

    // Add culprit_mod column if it doesn't exist (migration)
    try {
      await run(`ALTER TABLE crash_logs ADD COLUMN culprit_mod TEXT`)
    } catch (error: any) {
      // Column already exists or other error - ignore
      if (!error.message.includes('duplicate column name')) {
        console.log('Migration note:', error.message)
      }
    }

    // Add user_id column if it doesn't exist (migration)
    try {
      await run(`ALTER TABLE crash_logs ADD COLUMN user_id TEXT`)
    } catch (error: any) {
      // Column already exists or other error - ignore
      if (!error.message.includes('duplicate column name')) {
        console.log('Migration note:', error.message)
      }
    }

    // Create users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await run(`
      CREATE INDEX IF NOT EXISTS idx_created_at ON crash_logs (created_at DESC)
    `)
    
    await run(`
      CREATE INDEX IF NOT EXISTS idx_minecraft_version ON crash_logs (minecraft_version)
    `)
    
    await run(`
      CREATE INDEX IF NOT EXISTS idx_mod_loader ON crash_logs (mod_loader)
    `)
    
    await run(`
      CREATE INDEX IF NOT EXISTS idx_error_type ON crash_logs (error_type)
    `)

    // Enable FTS for search
    await run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS crash_logs_fts USING fts5(
        id UNINDEXED,
        content,
        error_message,
        mod_list,
        tags,
        content='crash_logs',
        content_rowid='rowid'
      )
    `)
  }

  // New method to get total crash log count
  async getTotalCrashLogCount(): Promise<number> {
    const get = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err)
          else resolve(row)
        })
      })
    
    const row = await get(`
      SELECT COUNT(*) as count FROM crash_logs
    `, []) as any

    return row.count || 0
  }

  // New method to delete oldest crash logs to maintain limit
  private async deleteOldestCrashLogs(countToDelete: number): Promise<void> {
    const run = (sql: string, params: any[]) => 
      new Promise<void>((resolve, reject) => {
        this.db.run(sql, params, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    
    await run(`
      DELETE FROM crash_logs 
      WHERE id IN (
        SELECT id FROM crash_logs 
        ORDER BY created_at ASC 
        LIMIT ?
      )
    `, [countToDelete])
  }

  async createCrashLog(crashLog: Omit<CrashLog, 'createdAt'>): Promise<void> {
    // Check total count and enforce 100 limit
    const totalCount = await this.getTotalCrashLogCount()
    
    // If we're at or above 100, delete the oldest logs to make room
    if (totalCount >= 100) {
      const logsToDelete = totalCount - 100 + 1 // +1 to make room for new log
      await this.deleteOldestCrashLogs(logsToDelete)
    }

    await new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO crash_logs (
          id, title, content, minecraft_version, mod_loader, mod_loader_version,
          mod_list, error_type, error_message, stack_trace, culprit_mod, user_id, ip_address, user_agent,
          expires_at, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run([
        crashLog.id,
        crashLog.title,
        crashLog.content,
        crashLog.minecraftVersion,
        crashLog.modLoader,
        crashLog.modLoaderVersion,
        JSON.stringify(crashLog.modList || []),
        crashLog.errorType,
        crashLog.errorMessage,
        crashLog.stackTrace,
        crashLog.culpritMod,
        crashLog.userId,
        crashLog.ipAddress,
        crashLog.userAgent,
        crashLog.expiresAt?.toISOString(),
        JSON.stringify(crashLog.tags || [])
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })

      stmt.finalize()
    })
  }

  async getCrashLog(id: string): Promise<CrashLog | null> {
    const get = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err)
          else resolve(row)
        })
      })
    
    const row = await get(`
      SELECT * FROM crash_logs WHERE id = ?
    `, [id]) as any

    if (!row) return null

    return this.rowToCrashLog(row)
  }

  async searchCrashLogs(params: CrashLogSearchParams): Promise<CrashLog[]> {
    const all = (sql: string, params: any[]) => 
      new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows)
        })
      })
    let query = 'SELECT * FROM crash_logs WHERE 1=1'
    const values: any[] = []

    if (params.q) {
      query = `
        SELECT cl.* FROM crash_logs cl
        JOIN crash_logs_fts fts ON cl.rowid = fts.rowid
        WHERE crash_logs_fts MATCH ?
      `
      values.push(params.q)
    }

    if (params.minecraftVersion) {
      query += ' AND minecraft_version = ?'
      values.push(params.minecraftVersion)
    }

    if (params.modLoader) {
      query += ' AND mod_loader = ?'
      values.push(params.modLoader)
    }

    if (params.errorType) {
      query += ' AND error_type = ?'
      values.push(params.errorType)
    }

    if (params.mod) {
      query += ' AND mod_list LIKE ?'
      values.push(`%"${params.mod}"%`)
    }

    query += ' ORDER BY created_at DESC'

    if (params.limit) {
      query += ' LIMIT ?'
      values.push(params.limit)
    }

    if (params.offset) {
      query += ' OFFSET ?'
      values.push(params.offset)
    }

    const rows = await all(query, values) as any[]
    return rows.map(row => this.rowToCrashLog(row))
  }

  // User management methods
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> {
    const userId = require('uuid').v4()
    const now = new Date().toISOString()
    
    await new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, google_id, email, name, picture, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      stmt.run([
        userId,
        userData.googleId,
        userData.email,
        userData.name,
        userData.picture,
        now,
        now
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
      
      stmt.finalize()
    })

    return {
      id: userId,
      googleId: userData.googleId,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      createdAt: new Date(now),
      lastLogin: new Date(now)
    }
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    const get = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err)
          else resolve(row)
        })
      })
    
    const row = await get(`
      SELECT * FROM users WHERE google_id = ?
    `, [googleId]) as any

    if (!row) return null

    return {
      id: row.id,
      googleId: row.google_id,
      email: row.email,
      name: row.name,
      picture: row.picture,
      createdAt: new Date(row.created_at),
      lastLogin: new Date(row.last_login)
    }
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    const run = (sql: string, params: any[]) => 
      new Promise<void>((resolve, reject) => {
        this.db.run(sql, params, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    
    await run(`
      UPDATE users SET last_login = ? WHERE id = ?
    `, [new Date().toISOString(), userId])
  }

  async getUserCrashLogCount(userId: string): Promise<number> {
    const get = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err)
          else resolve(row)
        })
      })
    
    const row = await get(`
      SELECT COUNT(*) as count FROM crash_logs WHERE user_id = ?
    `, [userId]) as any

    return row.count || 0
  }

  async deleteOldestUserCrashLog(userId: string): Promise<void> {
    const run = (sql: string, params: any[]) => 
      new Promise<void>((resolve, reject) => {
        this.db.run(sql, params, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    
    await run(`
      DELETE FROM crash_logs 
      WHERE user_id = ? 
      ORDER BY created_at ASC 
      LIMIT 1
    `, [userId])
  }

  private rowToCrashLog(row: any): CrashLog {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      minecraftVersion: row.minecraft_version,
      modLoader: row.mod_loader,
      modLoaderVersion: row.mod_loader_version,
      modList: JSON.parse(row.mod_list || '[]'),
      errorType: row.error_type,
      errorMessage: row.error_message,
      stackTrace: row.stack_trace,
      culpritMod: row.culprit_mod,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      tags: JSON.parse(row.tags || '[]')
    }
  }

  async close(): Promise<void> {
    const close = promisify(this.db.close.bind(this.db))
    await close()
  }
}

export const database = new Database()