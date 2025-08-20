export interface CrashLog {
  id: string
  title?: string
  content: string
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
  minecraftVersion?: string
  modLoader?: string
  modLoaderVersion?: string
  errorType?: string
  errorMessage?: string
  modList?: string[]
  culpritMod?: string
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
}