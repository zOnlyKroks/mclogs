<template>
  <div class="comment-section">
    <div class="section-header">
      <h3>Comments</h3>
      <span class="comment-count">{{ comments.length }}</span>
    </div>

    <!-- Login prompt for anonymous users -->
    <div v-if="!user" class="login-prompt">
      <p>
        <a href="/api/auth/google" class="btn btn-primary">
          Sign in with Google
        </a>
        to leave a comment
      </p>
    </div>

    <!-- Comment form for logged-in users -->
    <div v-if="user && !isExpired" class="comment-form">
      <div class="user-info">
        <img 
          v-if="user.picture" 
          :src="user.picture" 
          :alt="user.name" 
          class="user-avatar"
        >
        <div v-else class="user-avatar-placeholder">
          {{ user.name.charAt(0).toUpperCase() }}
        </div>
        <span class="user-name">{{ user.name }}</span>
      </div>
      
      <div class="comment-input-container">
        <textarea
          v-model="newComment"
          placeholder="Write a comment..."
          class="comment-input"
          rows="3"
          maxlength="2000"
          :disabled="submitting"
        ></textarea>
        
        <div class="comment-actions">
          <div class="char-count">
            {{ newComment.length }}/2000
          </div>
          <div class="action-buttons">
            <button 
              @click="newComment = ''"
              :disabled="!newComment.trim() || submitting"
              class="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button 
              @click="submitComment"
              :disabled="!newComment.trim() || submitting"
              class="btn btn-primary btn-sm"
            >
              {{ submitting ? 'Posting...' : 'Post Comment' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Expired log message -->
    <div v-if="isExpired" class="expired-message">
      <p>This log has expired. Comments are no longer accepted.</p>
    </div>

    <!-- Comments list -->
    <div v-if="comments.length === 0" class="no-comments">
      <p>No comments yet. Be the first to comment!</p>
    </div>

    <div v-else class="comments-list">
      <div 
        v-for="comment in comments" 
        :key="comment.id"
        :id="`comment-${comment.id}`"
        class="comment"
      >
        <div class="comment-header">
          <img 
            v-if="comment.userPicture" 
            :src="comment.userPicture" 
            :alt="comment.userName" 
            class="comment-avatar"
          >
          <div v-else class="comment-avatar-placeholder">
            {{ comment.userName.charAt(0).toUpperCase() }}
          </div>
          
          <div class="comment-meta">
            <span class="comment-author">{{ comment.userName }}</span>
            <span 
              class="comment-date clickable" 
              @click="copyPermalink(comment.id)"
              :title="'Click to copy permalink • ' + comment.createdAt.toLocaleString()"
            >
              {{ formatDate(comment.createdAt) }}
              <span v-if="comment.updatedAt" class="edited-indicator">(edited)</span>
            </span>
          </div>

          <div v-if="user && user.id === comment.userId" class="comment-actions-menu">
            <button @click="toggleCommentMenu(comment.id)" class="menu-button">⋮</button>
            <div v-if="activeMenuId === comment.id" class="menu-dropdown">
              <button @click="startEdit(comment)" class="menu-item">Edit</button>
              <button @click="deleteComment(comment)" class="menu-item delete">Delete</button>
            </div>
          </div>
        </div>

        <div class="comment-content">
          <div v-if="editingId === comment.id" class="edit-form">
            <textarea
              v-model="editContent"
              class="edit-input"
              rows="3"
              maxlength="2000"
              :disabled="submitting"
            ></textarea>
            <div class="edit-actions">
              <div class="char-count">
                {{ editContent.length }}/2000
              </div>
              <div class="action-buttons">
                <button @click="cancelEdit" class="btn btn-secondary btn-sm">Cancel</button>
                <button 
                  @click="saveEdit(comment.id)"
                  :disabled="!editContent.trim() || submitting"
                  class="btn btn-primary btn-sm"
                >
                  {{ submitting ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
          <div v-else class="comment-text">
            {{ comment.content }}
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading">
      Loading comments...
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ApiService } from '../services/api'
import type { Comment } from '../types'

const props = defineProps<{
  crashLogId: string
  isExpired?: boolean
}>()

const authStore = useAuthStore()
const user = authStore.user

const comments = ref<Comment[]>([])
const loading = ref(true)
const error = ref('')
const submitting = ref(false)

const newComment = ref('')
const editingId = ref<string | null>(null)
const editContent = ref('')
const activeMenuId = ref<string | null>(null)

const loadComments = async () => {
  try {
    loading.value = true
    error.value = ''
    comments.value = await ApiService.getComments(props.crashLogId)
  } catch (err: any) {
    error.value = 'Failed to load comments'
    console.error('Error loading comments:', err)
  } finally {
    loading.value = false
  }
}

const submitComment = async () => {
  if (!newComment.value.trim()) return
  
  try {
    submitting.value = true
    const comment = await ApiService.createComment(props.crashLogId, newComment.value.trim())
    comments.value.push(comment)
    newComment.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to post comment'
  } finally {
    submitting.value = false
  }
}

const startEdit = (comment: Comment) => {
  editingId.value = comment.id
  editContent.value = comment.content
  activeMenuId.value = null
}

const cancelEdit = () => {
  editingId.value = null
  editContent.value = ''
}

const saveEdit = async (commentId: string) => {
  if (!editContent.value.trim()) return
  
  try {
    submitting.value = true
    await ApiService.updateComment(commentId, editContent.value.trim())
    
    // Update local comment
    const comment = comments.value.find(c => c.id === commentId)
    if (comment) {
      comment.content = editContent.value.trim()
      comment.updatedAt = new Date()
    }
    
    editingId.value = null
    editContent.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to update comment'
  } finally {
    submitting.value = false
  }
}

const deleteComment = async (comment: Comment) => {
  if (!confirm('Are you sure you want to delete this comment?')) return
  
  try {
    await ApiService.deleteComment(comment.id)
    comments.value = comments.value.filter(c => c.id !== comment.id)
    activeMenuId.value = null
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete comment'
  }
}

const toggleCommentMenu = (commentId: string) => {
  activeMenuId.value = activeMenuId.value === commentId ? null : commentId
}

const copyPermalink = async (commentId: string) => {
  try {
    const url = `${window.location.origin}/crash/${props.crashLogId}#comment-${commentId}`
    await navigator.clipboard.writeText(url)
    
    // Show brief feedback (you could enhance this with a toast notification)
    const originalError = error.value
    error.value = ''
    // Could add a success message here if desired
    setTimeout(() => {
      error.value = originalError
    }, 2000)
  } catch (err) {
    console.error('Failed to copy permalink:', err)
    error.value = 'Failed to copy permalink'
  }
}

const formatDate = (date: Date) => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

// Close menu when clicking outside
const handleClickOutside = (event: Event) => {
  if (!(event.target as Element)?.closest('.comment-actions-menu')) {
    activeMenuId.value = null
  }
}

onMounted(() => {
  loadComments()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.comment-section {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #e9ecef;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.section-header h3 {
  margin: 0;
  color: #2c3e50;
}

.comment-count {
  background: #e9ecef;
  color: #6c757d;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
}

.login-prompt {
  text-align: center;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.comment-form {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.user-avatar, .comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-placeholder, .comment-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #42b883;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
}

.comment-input-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment-input, .edit-input {
  width: 100%;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 0.75rem;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}

.comment-input:focus, .edit-input:focus {
  outline: none;
  border-color: #42b883;
  box-shadow: 0 0 0 2px rgba(66, 184, 131, 0.1);
}

.comment-actions, .edit-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-count {
  font-size: 0.875rem;
  color: #6c757d;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.expired-message {
  text-align: center;
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 8px;
  color: #856404;
  margin-bottom: 1.5rem;
}

.no-comments {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
  font-style: italic;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.comment {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  position: relative;
}

.comment-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.comment-author {
  font-weight: 500;
  color: #2c3e50;
  font-size: 0.9rem;
}

.comment-date {
  font-size: 0.8rem;
  color: #6c757d;
}

.comment-date.clickable {
  cursor: pointer;
  transition: color 0.2s ease;
}

.comment-date.clickable:hover {
  color: #42b883;
  text-decoration: underline;
}

.edited-indicator {
  font-style: italic;
}

.comment-actions-menu {
  margin-left: auto;
  position: relative;
}

.menu-button {
  background: none;
  border: none;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  color: #6c757d;
  font-size: 1.2rem;
  line-height: 1;
}

.menu-button:hover {
  background: #f8f9fa;
}

.menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 10;
  min-width: 100px;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 0.875rem;
}

.menu-item:hover {
  background: #f8f9fa;
}

.menu-item.delete {
  color: #d73a49;
}

.menu-item.delete:hover {
  background: #fff5f5;
}

.comment-content {
  margin-left: 2.5rem;
}

.comment-text {
  line-height: 1.5;
  color: #2c3e50;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}

@media (max-width: 768px) {
  .comment-content {
    margin-left: 0;
    margin-top: 0.75rem;
  }
  
  .comment-header {
    flex-wrap: wrap;
  }
  
  .comment-actions-menu {
    order: 3;
    margin-left: 0;
  }
}
</style>