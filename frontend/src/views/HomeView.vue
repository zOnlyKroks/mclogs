<template>
  <div class="home">
    <div class="hero">
      <h1>Minecraft Crash Log Sharing</h1>
      <p>Share and search Minecraft mod crash logs and stack traces</p>
      <div v-if="!authStore.isAuthenticated" class="hero-auth-prompt">
        <p class="auth-benefit">🔐 Sign in with Google to manage your logs (max 10 per user)</p>
        <button @click="authStore.login" class="btn btn-auth-hero">
          Sign in with Google
        </button>
      </div>
      <div v-else class="hero-user-info">
        <p class="user-greeting">👋 Welcome back, {{ authStore.user?.name }}!</p>
        <p class="user-info">You can submit up to 10 crash logs. Older ones will be automatically removed.</p>
      </div>
    </div>

    <form @submit.prevent="submitCrash" class="crash-form">
      <div class="form-group">
        <label for="title" class="form-label">Title (optional)</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          class="form-input"
          placeholder="Brief description of the crash"
          maxlength="200"
        />
      </div>

      <div class="form-group">
        <label for="content" class="form-label">Crash Log *</label>
        <textarea
          id="content"
          v-model="form.content"
          class="form-textarea"
          placeholder="Paste your crash log or stack trace here..."
          required
          rows="15"
        ></textarea>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn" :disabled="isSubmitting">
          {{ isSubmitting ? 'Submitting...' : 'Submit Crash Log' }}
        </button>
        <button 
          type="button" 
          @click="clearForm" 
          class="btn btn-secondary"
          :disabled="isSubmitting"
        >
          Clear Form
        </button>
      </div>
    </form>

    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="result" class="result-card">
      <div class="result-header">
        <div class="success-icon">✅</div>
        <h3>Crash log submitted successfully!</h3>
      </div>
      
      <div class="result-content">
        <div class="result-row">
          <span class="result-label">Share URL:</span>
          <div class="url-container">
            <router-link :to="`/crash/${result.id}`" class="crash-link">
              {{ shareUrl }}
            </router-link>
            <button @click="copyToClipboard" class="btn-copy" :class="{ copied: urlCopied }">
              {{ urlCopied ? '✓ Copied!' : '📋 Copy' }}
            </button>
          </div>
        </div>
        
        <div class="result-row">
          <span class="result-label">Expires:</span>
          <span class="result-value">{{ formatExpirationDate(result.expiresAt) }}</span>
        </div>

        <div class="result-actions">
          <router-link :to="`/crash/${result.id}`" class="btn btn-primary">
            View Crash Log
          </router-link>
          <button @click="clearForm" class="btn btn-secondary">
            Submit Another
          </button>
        </div>
      </div>
    </div>

    <div v-if="isSubmitting" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Processing crash log...</p>
    </div>

    <div class="info-section">
      <h2>How it works</h2>
      <div class="info-grid">
        <div class="info-item">
          <h3>1. Paste your crash log</h3>
          <p>Copy the full crash log or stack trace from your Minecraft launcher</p>
        </div>
        <div class="info-item">
          <h3>2. Automatic parsing</h3>
          <p>We extract Minecraft version, mods, and error information automatically</p>
        </div>
        <div class="info-item">
          <h3>3. Share and search</h3>
          <p>Get a shareable URL or search for similar crashes</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ApiService } from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { CreateCrashResponse } from '../types'

const form = reactive({
  title: '',
  content: ''
})

const authStore = useAuthStore()
const isSubmitting = ref(false)
const error = ref('')
const result = ref<CreateCrashResponse | null>(null)
const urlCopied = ref(false)

// Computed property for the share URL
const shareUrl = computed(() => {
  if (result.value) {
    return `${window.location.origin}/crash/${result.value.id}`
  }
  return ''
})

const submitCrash = async () => {
  if (!form.content.trim()) {
    error.value = 'Please enter a crash log'
    return
  }

  isSubmitting.value = true
  error.value = ''
  result.value = null

  try {
    const response = await ApiService.createCrashLog(
      form.content.trim(),
      form.title.trim() || undefined
    )
    result.value = response

    form.content = ''
    form.title = ''
    
    setTimeout(() => {
      const resultElement = document.querySelector('.result-card')
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to submit crash log'
  } finally {
    isSubmitting.value = false
  }
}

const clearForm = () => {
  form.content = ''
  form.title = ''
  result.value = null
  error.value = ''
}

const copyToClipboard = async () => {
  if (result.value) {
    const url = shareUrl.value
    try {
      await navigator.clipboard.writeText(url)
      urlCopied.value = true
      setTimeout(() => {
        urlCopied.value = false
      }, 2000)
    } catch (err) {
      console.error('Failed to copy URL:', err)
    }
  }
}

const formatExpirationDate = (dateString: Date |string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 1) {
    return 'Tomorrow'
  } else if (diffDays <= 7) {
    return `In ${diffDays} days`
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
}
</script>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 3rem;
}

.hero h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.hero p {
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 1rem;
}

.hero-auth-prompt,
.hero-user-info {
  margin-top: 2rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.auth-benefit,
.user-greeting,
.user-info {
  margin: 0.5rem 0;
  color: rgba(255, 255, 255, 0.95);
}

.user-greeting {
  font-size: 1.1rem;
  font-weight: 600;
  color: #42b883;
}

.btn-auth-hero {
  background: #4285f4;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  margin-top: 1rem;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
}

.btn-auth-hero:hover {
  background: #3367d6;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);
}

.crash-form {
  max-width: 800px;
  margin: 0 auto 2rem auto;
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.form-textarea {
  min-height: 300px;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.result-card {
  max-width: 800px;
  margin: 2rem auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #e9ecef;
}

.result-header {
  background: linear-gradient(135deg, #42b883 0%, #369870 100%);
  color: white;
  padding: 1.5rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.success-icon {
  font-size: 2rem;
}

.result-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.result-content {
  padding: 1.5rem;
}

.result-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
  gap: 0.5rem;
}

.result-label {
  font-weight: 600;
  color: #6c757d;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-value {
  color: #2c3e50;
  font-size: 1rem;
}

.url-container {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.crash-link {
  color: #42b883;
  word-break: break-all;
  flex: 1;
  min-width: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  text-decoration: none;
}

.crash-link:hover {
  background: #e9ecef;
}

.btn-copy {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-copy:hover {
  background: #5a6268;
}

.btn-copy.copied {
  background: #28a745;
  transform: scale(1.05);
}

.result-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary {
  background: #42b883;
  color: white;
}

.btn-primary:hover {
  background: #369870;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e9ecef;
  border-left-color: #42b883;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-overlay p {
  color: #6c757d;
  font-size: 1.1rem;
  margin: 0;
}

.info-section {
  max-width: 800px;
  margin: 3rem auto;
}

.info-section h2 {
  text-align: center;
  margin-bottom: 2rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
}

.info-item {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.info-item h3 {
  color: #42b883;
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .hero h1 {
    font-size: 2rem;
  }
  
  .crash-form {
    padding: 1rem;
    margin: 0 0 2rem 0;
  }
}
</style>