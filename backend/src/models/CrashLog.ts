export interface CrashLog {
  id: string
  title?: string
  content: string
  minecraftVersion?: string
  modLoader?: string  // forge, fabric, quilt, neoforge
  modLoaderVersion?: string
  modList?: string[]
  errorType?: string  // extracted from stack trace
  errorMessage?: string
  stackTrace?: string
  culpritMod?: string  // mod that likely caused the crash
  userId?: string     // Google user ID (optional for backward compatibility)
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