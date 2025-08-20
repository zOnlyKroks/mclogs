<template>
  <div class="dashboard-view">
    <div v-if="loading" class="loading">
      <p>Loading dashboard...</p>
    </div>

    <div v-else-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-else-if="dashboard" class="dashboard-content">
      <!-- User Profile Header -->
      <div class="profile-header">
        <div class="profile-info">
          <img 
            v-if="dashboard.user.picture" 
            :src="dashboard.user.picture" 
            :alt="dashboard.user.name" 
            class="profile-avatar"
          >
          <div v-else class="profile-avatar-placeholder">
            {{ dashboard.user.name.charAt(0).toUpperCase() }}
          </div>
          
          <div class="profile-details">
            <h1>{{ dashboard.user.name }}</h1>
            <p class="profile-email">{{ dashboard.user.email }}</p>
            <p class="profile-joined">
              Joined {{ formatDate(dashboard.user.createdAt) }}
              <span v-if="dashboard.user.lastLogin" class="last-login">
                • Last active {{ formatDate(dashboard.user.lastLogin) }}
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- Stats Overview -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ dashboard.stats.totalCrashLogs }}</div>
          <div class="stat-label">Total Reports</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">{{ dashboard.stats.activeCrashLogs }}</div>
          <div class="stat-label">Active Reports</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">{{ dashboard.stats.expiredCrashLogs }}</div>
          <div class="stat-label">Expired Reports</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-value">{{ dashboard.stats.recentComments }}</div>
          <div class="stat-label">Recent Comments</div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="dashboard-main">
        <!-- Crash Logs Section -->
        <div class="section">
          <div class="section-header">
            <h2>Your Log Reports</h2>
            <router-link to="/" class="btn btn-primary">
              Create New Report
            </router-link>
          </div>

          <div v-if="dashboard.crashLogs.length === 0" class="empty-state">
            <p>You haven't created any log reports yet.</p>
            <router-link to="/" class="btn btn-primary">
              Create Your First Report
            </router-link>
          </div>

          <div v-else class="crash-logs-grid">
            <div 
              v-for="log in dashboard.crashLogs" 
              :key="log.id"
              class="crash-log-card"
              :class="{ 'expired': log.isExpired }"
            >
              <div class="log-header">
                <h3>
                  <router-link :to="`/crash/${log.id}`" class="log-title">
                    {{ log.title || `Log Report ${formatDate(log.createdAt)}` }}
                  </router-link>
                </h3>
                <div class="log-status">
                  <span v-if="log.isExpired" class="status-badge expired">Expired</span>
                  <span v-else class="status-badge active">Active</span>
                </div>
              </div>

              <div v-if="log.description" class="log-description">
                {{ log.description }}
              </div>

              <div class="log-meta">
                <div class="meta-grid">
                  <div v-if="log.minecraftVersion" class="meta-item">
                    <span class="meta-label">MC Version:</span>
                    <span class="meta-value">{{ log.minecraftVersion }}</span>
                  </div>
                  
                  <div v-if="log.modLoader" class="meta-item">
                    <span class="meta-label">Mod Loader:</span>
                    <span class="meta-value">{{ log.modLoader }}</span>
                  </div>
                  
                  <div v-if="log.errorType" class="meta-item">
                    <span class="meta-label">Error:</span>
                    <span class="meta-value error-type">{{ log.errorType }}</span>
                  </div>
                  
                  <div class="meta-item">
                    <span class="meta-label">Files:</span>
                    <span class="meta-value">{{ log.fileCount }}</span>
                  </div>
                </div>
              </div>

              <div class="log-footer">
                <div class="log-dates">
                  <span>Created {{ formatDate(log.createdAt) }}</span>
                  <span v-if="log.expiresAt">
                    Expires {{ formatDate(log.expiresAt) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Comments Section -->
        <div class="section">
          <div class="section-header">
            <h2>Recent Comments</h2>
            <span class="comment-count">Last 30 days</span>
          </div>

          <div v-if="dashboard.recentComments.length === 0" class="empty-state">
            <p>You haven't posted any comments recently.</p>
          </div>

          <div v-else class="comments-list">
            <div 
              v-for="comment in dashboard.recentComments" 
              :key="comment.id"
              class="comment-item"
            >
              <div class="comment-header">
                <router-link 
                  :to="`/crash/${comment.crashLogId}`"
                  class="comment-link"
                >
                  View Log Report
                </router-link>
                <span class="comment-date">
                  {{ formatDate(comment.createdAt) }}
                  <span v-if="comment.updatedAt" class="edited-indicator">(edited)</span>
                </span>
              </div>
              
              <div class="comment-content">
                {{ comment.content }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ApiService } from '../services/api'
import type { UserDashboard } from '../types'

const dashboard = ref<UserDashboard | null>(null)
const loading = ref(true)
const error = ref('')

const loadDashboard = async () => {
  try {
    loading.value = true
    error.value = ''
    dashboard.value = await ApiService.getUserDashboard()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
}

const formatDate = (date?: Date) => {
  if (!date) return 'Unknown'
  
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(() => {
  loadDashboard()
})
</script>

<style scoped>
.dashboard-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.profile-header {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  margin-bottom: 2rem;
}

.profile-info {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.profile-avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #42b883;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 2rem;
}

.profile-details h1 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
  font-size: 2rem;
}

.profile-email {
  margin: 0 0 0.5rem 0;
  color: #6c757d;
  font-size: 1.1rem;
}

.profile-joined {
  margin: 0;
  color: #6c757d;
  font-size: 0.9rem;
}

.last-login {
  margin-left: 0.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  text-align: center;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #42b883;
  margin-bottom: 0.5rem;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  margin-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.section-header h2 {
  margin: 0;
  color: #2c3e50;
}

.comment-count {
  background: #e9ecef;
  color: #6c757d;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6c757d;
}

.empty-state p {
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
}

.crash-logs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.crash-log-card {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.2s;
}

.crash-log-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.crash-log-card.expired {
  opacity: 0.6;
  background: #f8f9fa;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.log-header h3 {
  margin: 0;
  flex: 1;
}

.log-title {
  color: #2c3e50;
  text-decoration: none;
  font-size: 1.1rem;
  line-height: 1.3;
}

.log-title:hover {
  color: #42b883;
}

.log-status {
  margin-left: 1rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.expired {
  background: #f8d7da;
  color: #721c24;
}

.log-description {
  color: #6c757d;
  margin-bottom: 1rem;
  line-height: 1.4;
}

.log-meta {
  margin-bottom: 1rem;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meta-label {
  font-size: 0.8rem;
  color: #6c757d;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-value {
  color: #2c3e50;
  font-size: 0.9rem;
}

.meta-value.error-type {
  color: #d73a49;
  font-weight: 600;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.log-footer {
  padding-top: 1rem;
  border-top: 1px solid #f8f9fa;
}

.log-dates {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #6c757d;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.comment-item {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 1rem;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.comment-link {
  color: #42b883;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
}

.comment-link:hover {
  text-decoration: underline;
}

.comment-date {
  font-size: 0.8rem;
  color: #6c757d;
}

.edited-indicator {
  font-style: italic;
}

.comment-content {
  color: #2c3e50;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.loading {
  text-align: center;
  padding: 4rem;
  color: #6c757d;
}

@media (max-width: 768px) {
  .dashboard-view {
    padding: 1rem;
  }
  
  .profile-info {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
  }
  
  .profile-details h1 {
    font-size: 1.5rem;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .crash-logs-grid {
    grid-template-columns: 1fr;
  }
  
  .section {
    padding: 1.5rem;
  }
  
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .log-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .log-status {
    margin-left: 0;
  }
  
  .meta-grid {
    grid-template-columns: 1fr;
  }
  
  .log-dates {
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .comment-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>