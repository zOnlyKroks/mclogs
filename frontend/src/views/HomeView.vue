<template>
  <div class="home">
    <div class="hero">
      <h1>Minecraft Log Bundle Sharing</h1>
      <p>Upload multiple Minecraft logs (latest.log + crash logs) with comments</p>
      <div v-if="!authStore.isAuthenticated" class="hero-auth-prompt">
        <p class="auth-benefit">🔐 Sign in with Google to manage your log bundles (max 10 per user)</p>
        <button @click="authStore.login" class="btn btn-auth-hero">
          Sign in with Google
        </button>
      </div>
      <div v-else class="hero-user-info">
        <p class="user-greeting">👋 Welcome back, {{ authStore.user?.name }}!</p>
        <p class="user-info">You can submit up to 10 log bundles. Older ones will be automatically removed.</p>
      </div>
    </div>

    <form @submit.prevent="submitLogs" class="crash-form">
      <div class="form-group">
        <label for="title" class="form-label">Title (optional)</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          class="form-input"
          placeholder="Brief description of the issue"
          maxlength="200"
        />
      </div>

      <div class="form-group">
        <label for="description" class="form-label">Description/Comments (optional)</label>
        <textarea
          id="description"
          v-model="form.description"
          class="form-textarea description-textarea"
          placeholder="Describe what happened, what you were doing, any mods involved, etc..."
          rows="4"
          maxlength="1000"
        ></textarea>
        <div class="char-counter">{{ form.description.length }}/1000</div>
      </div>

      <div class="form-group">
        <label class="form-label">Log Files *</label>
        <div 
          class="file-drop-zone"
          :class="{ 'drag-over': isDragOver, 'has-files': files.length > 0 }"
          @drop="handleDrop"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
        >
          <div v-if="files.length === 0" class="drop-zone-content">
            <div class="drop-icon">📁</div>
            <p class="drop-text">Drag and drop your log files here</p>
            <p class="drop-subtext">or <button type="button" @click="triggerFileInput" class="file-link">browse files</button></p>
            <p class="file-types">Supported: .log, .txt files (max 10 files, 5MB total)</p>
          </div>
          <div v-else class="files-list">
            <div v-for="(file, index) in files" :key="index" class="file-item">
              <div class="file-info">
                <div class="file-name">{{ file.name }}</div>
                <div class="file-details">
                  <span class="file-type" :class="'type-' + file.type">{{ file.type }}</span>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                </div>
              </div>
              <button type="button" @click="removeFile(index)" class="remove-file">×</button>
            </div>
            <button type="button" @click="triggerFileInput" class="add-more-files">+ Add More Files</button>
          </div>
        </div>
        <input 
          ref="fileInput" 
          type="file" 
          multiple 
          accept=".log,.txt" 
          @change="handleFileInput" 
          class="hidden-file-input"
        />
      </div>

      <div class="form-actions">
        <button type="submit" class="btn" :disabled="isSubmitting || files.length === 0">
          {{ isSubmitting ? 'Uploading...' : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}` }}
        </button>
        <button 
          type="button" 
          @click="clearForm" 
          class="btn btn-secondary"
          :disabled="isSubmitting"
        >
          Clear All
        </button>
      </div>
    </form>

    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="result" class="result-card">
      <div class="result-header">
        <div class="success-icon">✅</div>
        <h3>Log bundle uploaded successfully!</h3>
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
          <span class="result-label">Files uploaded:</span>
          <span class="result-value">{{ result.fileCount }} files</span>
        </div>

        <div class="result-row">
          <span class="result-label">Expires:</span>
          <span class="result-value">{{ formatExpirationDate(result.expiresAt) }}</span>
        </div>

        <div class="result-actions">
          <router-link :to="`/crash/${result.id}`" class="btn btn-primary">
            View Log Bundle
          </router-link>
          <button @click="clearForm" class="btn btn-secondary">
            Upload Another
          </button>
        </div>
      </div>
    </div>

    <div v-if="isSubmitting" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Processing log bundle...</p>
    </div>

    <div class="info-section">
      <h2>How it works</h2>
      <div class="info-grid">
        <div class="info-item">
          <h3>1. Upload multiple logs</h3>
          <p>Drag and drop your latest.log and any crash logs together</p>
        </div>
        <div class="info-item">
          <h3>2. Add context</h3>
          <p>Describe what happened and any relevant details</p>
        </div>
        <div class="info-item">
          <h3>3. Share as bundle</h3>
          <p>Get a single URL that contains all your logs and comments</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ApiService } from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { CreateCrashResponse, LogFile } from '../types'

const form = reactive({
  title: '',
  description: ''
})

const authStore = useAuthStore()
const isSubmitting = ref(false)
const error = ref('')
const result = ref<CreateCrashResponse | null>(null)
const urlCopied = ref(false)
const files = ref<LogFile[]>([])
const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const shareUrl = computed(() => {
  if (result.value) {
    return `${window.location.origin}/crash/${result.value.id}`
  }
  return ''
})

const detectLogType = (filename: string): LogFile['type'] => {
  const lower = filename.toLowerCase()
  if (lower.includes('latest')) return 'latest'
  if (lower.includes('crash')) return 'crash'
  if (lower.includes('debug')) return 'debug'
  return 'other'
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

const processFiles = async (fileList: FileList) => {
  const newFiles: LogFile[] = []
  let totalSize = files.value.reduce((sum, f) => sum + f.size, 0)

  for (const file of Array.from(fileList)) {
    if (files.value.length + newFiles.length >= 10) {
      error.value = 'Maximum 10 files allowed'
      break
    }

    if (file.size > 2000000) {
      error.value = `File ${file.name} is too large (max 2MB per file)`
      continue
    }

    totalSize += file.size
    if (totalSize > 5000000) {
      error.value = 'Total file size exceeds 5MB limit'
      break
    }

    try {
      const content = await readFileContent(file)
      newFiles.push({
        name: file.name,
        content,
        type: detectLogType(file.name),
        size: file.size
      })
    } catch (err) {
      error.value = `Failed to read file ${file.name}`
    }
  }

  files.value.push(...newFiles)
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  
  if (event.dataTransfer?.files) {
    processFiles(event.dataTransfer.files)
  }
}

const handleFileInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files) {
    processFiles(target.files)
    target.value = '' // Reset input
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const removeFile = (index: number) => {
  files.value.splice(index, 1)
}

const submitLogs = async () => {
  if (files.value.length === 0) {
    error.value = 'Please select at least one log file'
    return
  }

  isSubmitting.value = true
  error.value = ''
  result.value = null

  try {
    const response = await ApiService.createCrashLog(
      files.value,
      form.title.trim() || undefined,
      form.description.trim() || undefined
    )
    result.value = response

    form.title = ''
    form.description = ''
    files.value = []
    
    setTimeout(() => {
      const resultElement = document.querySelector('.result-card')
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to upload log bundle'
  } finally {
    isSubmitting.value = false
  }
}

const clearForm = () => {
  form.title = ''
  form.description = ''
  files.value = []
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

const formatExpirationDate = (dateString: Date | string) => {
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

.description-textarea {
  min-height: 100px;
  resize: vertical;
}

.char-counter {
  text-align: right;
  font-size: 0.875rem;
  color: #6c757d;
  margin-top: 0.25rem;
}

.file-drop-zone {
  border: 2px dashed #dee2e6;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
  background: #f8f9fa;
}

.file-drop-zone.drag-over {
  border-color: #42b883;
  background: rgba(66, 184, 131, 0.05);
}

.file-drop-zone.has-files {
  border-style: solid;
  border-color: #42b883;
  background: rgba(66, 184, 131, 0.02);
}

.drop-zone-content {
  pointer-events: none;
}

.drop-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.drop-text {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.drop-subtext {
  color: #6c757d;
  margin-bottom: 1rem;
}

.file-link {
  color: #42b883;
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
}

.file-link:hover {
  color: #369870;
}

.file-types {
  font-size: 0.875rem;
  color: #6c757d;
}

.files-list {
  text-align: left;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  background: white;
}

.file-info {
  flex: 1;
}

.file-name {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.25rem;
}

.file-details {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.file-type {
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.type-latest {
  background: #d4edda;
  color: #155724;
}

.type-crash {
  background: #f8d7da;
  color: #721c24;
}

.type-debug {
  background: #d1ecf1;
  color: #0c5460;
}

.type-other {
  background: #e2e3e5;
  color: #383d41;
}

.file-size {
  color: #6c757d;
}

.remove-file {
  background: #dc3545;
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.remove-file:hover {
  background: #c82333;
}

.add-more-files {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  margin-top: 1rem;
  transition: background 0.2s;
}

.add-more-files:hover {
  background: #369870;
}

.hidden-file-input {
  display: none;
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
  
  .file-drop-zone {
    padding: 1rem;
  }
  
  .url-container {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>