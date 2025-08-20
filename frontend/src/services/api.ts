import axios from 'axios'
import type { CrashLog, SearchResponse, CreateCrashResponse, SearchParams } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// Ensure the api instance inherits auth headers from global axios defaults
api.interceptors.request.use((config) => {
  const authHeader = axios.defaults.headers.common['Authorization']
  if (authHeader && !config.headers['Authorization']) {
    config.headers['Authorization'] = authHeader
  }
  return config
})

export class ApiService {
  static async createCrashLog(content: string, title?: string): Promise<CreateCrashResponse> {
    const response = await api.post('/crashes', { content, title })
    return response.data
  }

  static async getCrashLog(id: string): Promise<CrashLog> {
    const response = await api.get(`/crashes/${id}`)
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : undefined
    }
  }

  static async searchCrashLogs(params: SearchParams): Promise<SearchResponse> {
    const response = await api.get('/crashes', { params })
    return {
      ...response.data,
      results: response.data.results.map((result: any) => ({
        ...result,
        createdAt: new Date(result.createdAt)
      }))
    }
  }
}