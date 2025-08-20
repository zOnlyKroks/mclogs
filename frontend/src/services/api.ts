import axios from 'axios'
import type { CrashLog, SearchResponse, CreateCrashResponse, SearchParams, LogFile, Comment, UserDashboard } from '../types'

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
  static async createCrashLog(files: LogFile[], title?: string, description?: string): Promise<CreateCrashResponse> {
    const response = await api.post('/crashes', { files, title, description })
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

  static async deleteCrashLog(id: string): Promise<void> {
    await api.delete(`/crashes/${id}`)
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

  // Comment methods
  static async getComments(crashLogId: string): Promise<Comment[]> {
    const response = await api.get(`/comments/crash/${crashLogId}`)
    return response.data.comments.map((comment: any) => ({
      ...comment,
      createdAt: new Date(comment.createdAt),
      updatedAt: comment.updatedAt ? new Date(comment.updatedAt) : undefined
    }))
  }

  static async createComment(crashLogId: string, content: string): Promise<Comment> {
    const response = await api.post(`/comments/crash/${crashLogId}`, { content })
    return {
      ...response.data.comment,
      createdAt: new Date(response.data.comment.createdAt),
      updatedAt: response.data.comment.updatedAt ? new Date(response.data.comment.updatedAt) : undefined
    }
  }

  static async updateComment(commentId: string, content: string): Promise<void> {
    await api.put(`/comments/${commentId}`, { content })
  }

  static async deleteComment(commentId: string): Promise<void> {
    await api.delete(`/comments/${commentId}`)
  }

  // User methods
  static async getUserDashboard(): Promise<UserDashboard> {
    const response = await api.get('/users/me/dashboard')
    return {
      ...response.data,
      user: {
        ...response.data.user,
        createdAt: response.data.user.createdAt ? new Date(response.data.user.createdAt) : undefined,
        lastLogin: response.data.user.lastLogin ? new Date(response.data.user.lastLogin) : undefined
      },
      crashLogs: response.data.crashLogs.map((log: any) => ({
        ...log,
        createdAt: new Date(log.createdAt),
        expiresAt: log.expiresAt ? new Date(log.expiresAt) : undefined
      })),
      recentComments: response.data.recentComments.map((comment: any) => ({
        ...comment,
        createdAt: new Date(comment.createdAt),
        updatedAt: comment.updatedAt ? new Date(comment.updatedAt) : undefined
      }))
    }
  }
}