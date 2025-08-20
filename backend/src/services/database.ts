import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import { CrashLog, CrashLogSearchParams, Comment } from '../models/CrashLog'
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
        files TEXT NOT NULL,  -- JSON array of LogFile objects
        description TEXT,
        minecraft_version TEXT,
        mod_loader TEXT,
        mod_loader_version TEXT,
        mod_list TEXT,  -- JSON array as string
        error_type TEXT,
        error_message TEXT,
        stack_trace TEXT,
        culprit_mod TEXT,
        user_id TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        tags TEXT  -- JSON array as string
      )
    `)

    // Migration: Add new columns for multi-file support
    const migrations = [
      'files TEXT',
      'description TEXT',
      'culprit_mod TEXT',
      'user_id TEXT'
    ]
    
    for (const migration of migrations) {
      try {
        await run(`ALTER TABLE crash_logs ADD COLUMN ${migration}`)
      } catch (error: any) {
        if (!error.message.includes('duplicate column name')) {
          console.log('Migration note:', error.message)
        }
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
        files,
        description,
        error_message,
        mod_list,
        tags,
        content='crash_logs',
        content_rowid='rowid'
      )
    `)

    // Create comments table
    await run(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        crash_log_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_picture TEXT,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        FOREIGN KEY (crash_log_id) REFERENCES crash_logs (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `)

    await run(`
      CREATE INDEX IF NOT EXISTS idx_comments_crash_log_id ON comments (crash_log_id)
    `)

    await run(`
      CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id)
    `)

    await run(`
      CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC)
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
          id, title, files, description, minecraft_version, mod_loader, mod_loader_version,
          mod_list, error_type, error_message, stack_trace, culprit_mod, user_id, ip_address, user_agent,
          expires_at, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run([
        crashLog.id,
        crashLog.title,
        JSON.stringify(crashLog.files),
        crashLog.description,
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

  private escapeFTS5Query(query: string): string {
    // FTS5 query escaping - wrap in double quotes to treat as phrase
    // This prevents syntax errors from special characters like dots
    return `"${query.replace(/"/g, '""')}"`
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
      values.push(this.escapeFTS5Query(params.q))
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

  async deleteCrashLog(id: string, userId: string): Promise<boolean> {
    const run = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err)
          else resolve({ changes: this.changes })
        })
      })
    
    const result = await run(`
      DELETE FROM crash_logs WHERE id = ? AND user_id = ?
    `, [id, userId]) as any

    return result.changes > 0
  }

  // Comment methods
  async createComment(commentData: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment> {
    const commentId = require('uuid').v4()
    const now = new Date().toISOString()
    
    await new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO comments (id, crash_log_id, user_id, user_name, user_picture, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      stmt.run([
        commentId,
        commentData.crashLogId,
        commentData.userId,
        commentData.userName,
        commentData.userPicture,
        commentData.content,
        now
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
      
      stmt.finalize()
    })

    return {
      id: commentId,
      crashLogId: commentData.crashLogId,
      userId: commentData.userId,
      userName: commentData.userName,
      userPicture: commentData.userPicture,
      content: commentData.content,
      createdAt: new Date(now)
    }
  }

  async getCommentsByCrashLogId(crashLogId: string): Promise<Comment[]> {
    const all = (sql: string, params: any[]) => 
      new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows)
        })
      })
    
    const rows = await all(`
      SELECT * FROM comments WHERE crash_log_id = ? ORDER BY created_at ASC
    `, [crashLogId]) as any[]

    return rows.map(row => this.rowToComment(row))
  }

  async updateComment(commentId: string, content: string, userId: string): Promise<boolean> {
    const run = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err)
          else resolve({ changes: this.changes })
        })
      })
    
    const result = await run(`
      UPDATE comments SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `, [content, new Date().toISOString(), commentId, userId]) as any

    return result.changes > 0
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const run = (sql: string, params: any[]) => 
      new Promise<any>((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err)
          else resolve({ changes: this.changes })
        })
      })
    
    const result = await run(`
      DELETE FROM comments WHERE id = ? AND user_id = ?
    `, [commentId, userId]) as any

    return result.changes > 0
  }

  async getUserRecentComments(userId: string, days: number = 30): Promise<Comment[]> {
    const all = (sql: string, params: any[]) => 
      new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows)
        })
      })
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    
    const rows = await all(`
      SELECT * FROM comments 
      WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `, [userId, cutoffDate.toISOString()]) as any[]

    return rows.map(row => this.rowToComment(row))
  }

  async getUserCrashLogs(userId: string): Promise<CrashLog[]> {
    const all = (sql: string, params: any[]) => 
      new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err)
          else resolve(rows)
        })
      })
    
    const rows = await all(`
      SELECT * FROM crash_logs WHERE user_id = ? ORDER BY created_at DESC
    `, [userId]) as any[]

    return rows.map(row => this.rowToCrashLog(row))
  }

  private rowToComment(row: any): Comment {
    return {
      id: row.id,
      crashLogId: row.crash_log_id,
      userId: row.user_id,
      userName: row.user_name,
      userPicture: row.user_picture,
      content: row.content,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
    }
  }

  private rowToCrashLog(row: any): CrashLog {
    return {
      id: row.id,
      title: row.title,
      files: JSON.parse(row.files || '[]'),
      description: row.description,
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