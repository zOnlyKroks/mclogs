export interface LogFile {
  name: string
  content: string
  type: 'latest' | 'crash' | 'debug' | 'other'
  size: number
}

export interface CrashLog {
  id: string
  title?: string
  files: LogFile[]
  description?: string
  minecraftVersion?: string
  modLoader?: string
  modLoaderVersion?: string
  modList?: string[]
  errorType?: string
  errorMessage?: string
  stackTrace?: string
  culpritMod?: string
  ipAddress: string
  userAgent?: string
  createdAt: Date
  expiresAt?: Date
  tags?: string[]
}

export interface CrashLogSearchResult {
  id: string
  title?: string
  description?: string
  minecraftVersion?: string
  modLoader?: string
  modLoaderVersion?: string
  errorType?: string
  errorMessage?: string
  modList?: string[]
  culpritMod?: string
  fileCount: number
  createdAt: Date
}

export interface SearchResponse {
  results: CrashLogSearchResult[]
  totalResults: number
  params: SearchParams
}

export interface SearchParams {
  q?: string
  minecraftVersion?: string
  modLoader?: string
  errorType?: string
  mod?: string
  limit?: number
  offset?: number
}

export interface CreateCrashResponse {
  id: string
  url: string
  expiresAt: Date
  fileCount: number
}

export interface Comment {
  id: string
  crashLogId: string
  userId: string
  userName: string
  userPicture?: string
  content: string
  createdAt: Date
  updatedAt?: Date
}

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  createdAt?: Date
  lastLogin?: Date
}

export interface UserDashboard {
  user: User
  stats: {
    totalCrashLogs: number
    activeCrashLogs: number
    expiredCrashLogs: number
    recentComments: number
  }
  crashLogs: UserCrashLog[]
  recentComments: Comment[]
}

export interface UserCrashLog {
  id: string
  title?: string
  description?: string
  minecraftVersion?: string
  modLoader?: string
  errorType?: string
  errorMessage?: string
  culpritMod?: string
  fileCount: number
  createdAt: Date
  expiresAt?: Date
  isExpired: boolean
}