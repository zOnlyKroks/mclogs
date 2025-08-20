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
  return content
    .replace(/(Exception|Error)(\s*:.*)?$/gm, '<span class="hljs-exception">$1$2</span>')
    .replace(/^\s*at\s+(.+)$/gm, '<span class="hljs-stacktrace">at $1</span>')
    .replace(/^\s*Caused by:\s*(.+)$/gm, '<span class="hljs-caused-by">Caused by: $1</span>')
    .replace(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/g, '<span class="hljs-timestamp">$1</span>')
    .replace(/(\[[\d:]+\])/g, '<span class="hljs-timestamp">$1</span>')
    .replace(/(WARN|ERROR|FATAL|INFO|DEBUG)/g, '<span class="hljs-log-level hljs-log-$1">$1</span>')
    .replace(/(minecraft|forge|fabric|quilt|neoforge)/gi, '<span class="hljs-platform">$1</span>')
    .replace(/(\w+\.jar)/g, '<span class="hljs-jar">$1</span>')
    .replace(/(java\.lang\.\w+)/g, '<span class="hljs-java-class">$1</span>')
    .replace(/(\w+\.\w+\.\w+)/g, '<span class="hljs-package">$1</span>')
    .replace(/(\[REDACTED_\w+\])/g, '<span class="hljs-redacted">$1</span>')
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
}

.file-content-body pre {
  margin: 0;
  padding: 1.5rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  background: #fafafa;
}

.file-content-body code {
  background: none;
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

/* Custom highlighting styles */
:deep(.hljs-exception) {
  color: #d73a49;
  font-weight: bold;
}

:deep(.hljs-stacktrace) {
  color: #6f42c1;
}

:deep(.hljs-caused-by) {
  color: #e36209;
  font-weight: bold;
}

:deep(.hljs-timestamp) {
  color: #005cc5;
}

:deep(.hljs-log-level) {
  font-weight: bold;
}

:deep(.hljs-log-ERROR),
:deep(.hljs-log-FATAL) {
  color: #d73a49;
}

:deep(.hljs-log-WARN) {
  color: #e36209;
}

:deep(.hljs-log-INFO) {
  color: #28a745;
}

:deep(.hljs-log-DEBUG) {
  color: #6c757d;
}

:deep(.hljs-platform) {
  color: #005cc5;
  font-weight: bold;
}

:deep(.hljs-jar) {
  color: #032f62;
  background: #f6f8fa;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

:deep(.hljs-java-class) {
  color: #d73a49;
}

:deep(.hljs-package) {
  color: #6f42c1;
}

:deep(.hljs-redacted) {
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-style: italic;
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