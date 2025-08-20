<template>
  <div class="crash-log-display">
    <div class="crash-log-header">
      <div class="header-info">
        <h2>{{ crashLog.title || 'Log Bundle' }}</h2>
        <div class="meta-info">
          <span class="file-count">{{ crashLog.files.length }} files</span>
          <span class="created-date">{{ formatDate(crashLog.createdAt) }}</span>
        </div>
      </div>
      <div class="crash-log-actions">
        <button @click="copyToClipboard" class="btn btn-secondary">
          Copy URL
        </button>
        <button @click="downloadBundle" class="btn btn-secondary">
          Download Bundle
        </button>
        <button 
          v-if="canDelete"
          @click="handleDelete" 
          class="btn btn-danger"
          title="Force close this log report"
        >
          Force Close
        </button>
      </div>
    </div>

    <div v-if="crashLog.description" class="description-section">
      <h3>Description</h3>
      <p class="description-text">{{ crashLog.description }}</p>
    </div>

    <div class="files-section">
      <div class="file-tabs">
        <button 
          v-for="(file, index) in crashLog.files" 
          :key="index"
          :class="['file-tab', { active: activeFileIndex === index }]"
          @click="activeFileIndex = index"
        >
          <span class="file-name">{{ file.name }}</span>
          <span class="file-type" :class="'type-' + file.type">{{ file.type }}</span>
        </button>
      </div>

      <div class="file-content">
        <div class="file-content-header">
          <div class="file-info">
            <span class="current-file-name">{{ currentFile.name }}</span>
            <span class="file-size">{{ formatFileSize(currentFile.size) }}</span>
          </div>
          <div class="file-actions">
            <button @click="copyCurrentFile" class="btn btn-sm">
              Copy File
            </button>
            <button @click="downloadCurrentFile" class="btn btn-sm">
              Download
            </button>
          </div>
        </div>
        
        <div class="file-content-body">
          <pre ref="codeElement"><code>{{ currentFile.content }}</code></pre>
        </div>
      </div>
    </div>

    <div v-if="crashLog.minecraftVersion || crashLog.modLoader" class="metadata-section">
      <h3>Detected Information</h3>
      <div class="metadata-grid">
        <div v-if="crashLog.minecraftVersion" class="metadata-item">
          <span class="metadata-label">Minecraft Version:</span>
          <span class="metadata-value">{{ crashLog.minecraftVersion }}</span>
        </div>
        <div v-if="crashLog.modLoader" class="metadata-item">
          <span class="metadata-label">Mod Loader:</span>
          <span class="metadata-value">{{ crashLog.modLoader }} {{ crashLog.modLoaderVersion || '' }}</span>
        </div>
        <div v-if="crashLog.errorType" class="metadata-item">
          <span class="metadata-label">Error Type:</span>
          <span class="metadata-value">{{ crashLog.errorType }}</span>
        </div>
        <div v-if="crashLog.culpritMod" class="metadata-item">
          <span class="metadata-label">Likely Cause:</span>
          <span class="metadata-value">{{ crashLog.culpritMod }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import type { CrashLog } from '../types'

interface Props {
  crashLog: CrashLog
}

const props = defineProps<Props>()
const emit = defineEmits<{
  delete: []
}>()

const authStore = useAuthStore()
const activeFileIndex = ref(0)
const codeElement = ref<HTMLElement>()

const currentFile = computed(() => props.crashLog.files[activeFileIndex.value])

const canDelete = computed(() => {
  return authStore.isAuthenticated && 
         authStore.user?.id === props.crashLog.userId
})

const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleString()
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const highlightCode = () => {
  if (codeElement.value) {
    const highlighted = highlightCrashLog(currentFile.value.content)
    codeElement.value.innerHTML = highlighted
  }
}

const highlightCrashLog = (content: string): string => {
  // Simple but robust highlighting that avoids regex conflicts
  const lines = content.split('\n')
  
  return lines.map(line => {
    // Skip if line is empty
    if (!line.trim()) return line
    
    // Exception/Error lines
    if (/(?:Exception|Error)\s*:/i.test(line)) {
      return line.replace(/(.*?)((?:Exception|Error))(\s*:.*)/i, 
        '$1<span class="hljs-exception">$2</span><span class="hljs-error-message">$3</span>')
    }
    
    // Stack trace lines
    if (/^\s*at\s+/.test(line)) {
      return line.replace(/^(\s*)(at\s+)([\w.$]+)(\([^)]*\))(.*)/, 
        '$1<span class="hljs-stacktrace-at">$2</span><span class="hljs-method">$3</span>$4<span class="hljs-mod-info">$5</span>')
    }
    
    // Caused by lines
    if (/^\s*Caused by:/i.test(line)) {
      return line.replace(/^(\s*Caused by:\s*)(.+)/i, 
        '<span class="hljs-caused-by">$1</span><span class="hljs-exception">$2</span>')
    }
    
    // Otherwise apply simple highlighting
    let highlighted = line
    
    // Timestamps
    highlighted = highlighted.replace(/(\d{4}[-/]\d{2}[-/]\d{2}[\s_T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)/g, 
      '<span class="hljs-timestamp">$1</span>')
    highlighted = highlighted.replace(/(\[\d{2}:\d{2}:\d{2}\])/g, 
      '<span class="hljs-timestamp">$1</span>')
    
    // Log levels
    highlighted = highlighted.replace(/\b(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b/gi, 
      '<span class="hljs-log-level hljs-log-$1">$1</span>')
    
    // Platform indicators
    highlighted = highlighted.replace(/\b(minecraft|forge|fabric|quilt|neoforge|modloader)\b/gi, 
      '<span class="hljs-platform">$1</span>')
    
    // JAR files
    highlighted = highlighted.replace(/(\w+(?:-[\w.]+)*\.jar)\b/g, 
      '<span class="hljs-jar">$1</span>')
    
    // Version numbers (be more specific to avoid conflicts)
    highlighted = highlighted.replace(/\b(\d+\.\d+\.\d+(?:\.\d+)*(?:[+-]\w+)?)\b/g, 
      '<span class="hljs-version">$1</span>')
    
    // Redacted info
    highlighted = highlighted.replace(/(\[REDACTED_\w+\])/g, 
      '<span class="hljs-redacted">$1</span>')
    
    return highlighted
  }).join('\n')
}

const copyToClipboard = async () => {
  const url = `${window.location.origin}/crash/${props.crashLog.id}`
  try {
    await navigator.clipboard.writeText(url)
  } catch (err) {
    console.error('Failed to copy URL:', err)
  }
}

const copyCurrentFile = async () => {
  try {
    await navigator.clipboard.writeText(currentFile.value.content)
  } catch (err) {
    console.error('Failed to copy file content:', err)
  }
}

const downloadCurrentFile = () => {
  const blob = new Blob([currentFile.value.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = currentFile.value.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const downloadBundle = () => {
  const bundleContent = props.crashLog.files.map(file => 
    `=== ${file.name} (${file.type}) ===\n${file.content}\n\n`
  ).join('')
  
  const fullBundle = `Log Bundle: ${props.crashLog.title || 'Untitled'}\nCreated: ${formatDate(props.crashLog.createdAt)}\n${props.crashLog.description ? `Description: ${props.crashLog.description}\n` : ''}\n${'='.repeat(50)}\n\n${bundleContent}`
  
  const blob = new Blob([fullBundle], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `minecraft-logs-${props.crashLog.id}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const handleDelete = () => {
  if (confirm('Are you sure you want to force close this log report? This action cannot be undone.')) {
    emit('delete')
  }
}

watch(activeFileIndex, async () => {
  await nextTick()
  highlightCode()
})

onMounted(async () => {
  await nextTick()
  highlightCode()
})
</script>

<style scoped>
.crash-log-display {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.crash-log-header {
  background: #f8f9fa;
  padding: 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info h2 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.meta-info {
  display: flex;
  gap: 1rem;
  color: #6c757d;
  font-size: 0.875rem;
}

.file-count {
  background: #e9ecef;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.crash-log-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.description-section {
  padding: 1.5rem;
  border-bottom: 1px solid #e9ecef;
  background: #f8f9fa;
}

.description-section h3 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.1rem;
}

.description-text {
  margin: 0;
  color: #495057;
  line-height: 1.6;
  white-space: pre-wrap;
}

.files-section {
  border-bottom: 1px solid #e9ecef;
}

.file-tabs {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  overflow-x: auto;
}

.file-tab {
  background: none;
  border: none;
  padding: 1rem 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  border-bottom: 3px solid transparent;
  white-space: nowrap;
}

.file-tab:hover {
  background: #e9ecef;
}

.file-tab.active {
  background: white;
  border-bottom-color: #42b883;
}

.file-name {
  font-weight: 500;
  color: #2c3e50;
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

.file-content-header {
  background: #f8f9fa;
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e9ecef;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.current-file-name {
  font-weight: 600;
  color: #2c3e50;
}

.file-size {
  color: #6c757d;
  font-size: 0.875rem;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.file-content-body {
  max-height: 70vh;
  overflow: auto;
  background: #fafafa;
  /* Fix background on horizontal scroll */
  background-attachment: local;
  /* Improve scrolling on touch devices */
  -webkit-overflow-scrolling: touch;
  /* Fix scroll momentum issues */
  overscroll-behavior: contain;
}

.file-content-body pre {
  margin: 0;
  padding: 1.5rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  background: transparent;
  /* Ensure content extends beyond container width */
  min-width: 100%;
  width: max-content;
}

.file-content-body code {
  background: none;
  white-space: pre;
  word-wrap: normal;
}

.metadata-section {
  padding: 1.5rem;
  background: #f8f9fa;
}

.metadata-section h3 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.1rem;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metadata-label {
  font-weight: 600;
  color: #6c757d;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metadata-value {
  color: #2c3e50;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
}

/* Enhanced crash log highlighting styles */
:deep(.hljs-exception) {
  color: #d73a49;
  font-weight: 600;
}

:deep(.hljs-error-message) {
  color: #c53030;
}

:deep(.hljs-stacktrace-at) {
  color: #6c757d;
  font-weight: 500;
}

:deep(.hljs-method) {
  color: #6f42c1;
  font-weight: 500;
}

:deep(.hljs-source) {
  color: #032f62;
}

:deep(.hljs-mod-info) {
  color: #e36209;
  font-style: italic;
}

:deep(.hljs-caused-by) {
  color: #e36209;
  font-weight: 600;
}

:deep(.hljs-timestamp) {
  color: #005cc5;
  font-weight: 500;
}

:deep(.hljs-log-level) {
  font-weight: 600;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

:deep(.hljs-log-TRACE) {
  color: #9ca3af;
  background: #f9fafb;
}

:deep(.hljs-log-DEBUG) {
  color: #6b7280;
  background: #f3f4f6;
}

:deep(.hljs-log-INFO) {
  color: #059669;
  background: #ecfdf5;
}

:deep(.hljs-log-WARN) {
  color: #d97706;
  background: #fffbeb;
}

:deep(.hljs-log-ERROR),
:deep(.hljs-log-FATAL) {
  color: #dc2626;
  background: #fef2f2;
}

:deep(.hljs-platform) {
  color: #0891b2;
  font-weight: 600;
  background: #f0f9ff;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

:deep(.hljs-jar) {
  color: #7c3aed;
  background: #f5f3ff;
  padding: 0.1em 0.4em;
  border-radius: 4px;
  font-weight: 500;
}

:deep(.hljs-java-class) {
  color: #b91c1c;
  font-weight: 500;
}

:deep(.hljs-minecraft-class) {
  color: #059669;
  font-weight: 500;
}

:deep(.hljs-mod-class) {
  color: #7c2d12;
  font-weight: 500;
}

:deep(.hljs-file-path) {
  color: #4b5563;
  background: #f9fafb;
  padding: 0.1em 0.2em;
  border-radius: 2px;
  font-family: inherit;
}

:deep(.hljs-hex) {
  color: #7c3aed;
  font-family: inherit;
}

:deep(.hljs-version) {
  color: #0891b2;
  font-weight: 500;
}

:deep(.hljs-redacted) {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-style: italic;
  font-weight: 500;
}

@media (max-width: 768px) {
  .crash-log-header {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }
  
  .crash-log-actions {
    justify-content: center;
  }
  
  .file-content-header {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }
  
  .file-info {
    justify-content: center;
  }
  
  .file-actions {
    justify-content: center;
  }
  
  .file-content-body pre {
    padding: 1rem;
    font-size: 0.75rem;
  }
  
  .metadata-grid {
    grid-template-columns: 1fr;
  }
}
</style>