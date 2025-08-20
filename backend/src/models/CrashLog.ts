export interface LogFile {
  name: string
  content: string
  type: 'latest' | 'crash' | 'debug' | 'other'
  size: number
}

export interface CrashLog {
  id: string
  title?: string
  files: LogFile[]  // array of log files (latest.log + crash logs)
  description?: string  // user comment/description
  minecraftVersion?: string
  modLoader?: string  // forge, fabric, quilt, neoforge
  modLoaderVersion?: string
  modList?: string[]
  errorType?: string  // extracted from stack trace
  errorMessage?: string
  stackTrace?: string
  culpritMod?: string  // mod that likely caused the crash
  userId: string
  ipAddress: string
  userAgent?: string
  createdAt: Date
  expiresAt?: Date
  tags?: string[]
}

export interface CrashLogSearchParams {
  q?: string  // general search
  minecraftVersion?: string
  modLoader?: string
  errorType?: string
  mod?: string
  limit?: number
  offset?: number
}