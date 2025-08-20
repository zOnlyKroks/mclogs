<template>
  <div class="crash-log-display">
    <div class="crash-log-header">
      <div class="crash-log-actions">
        <button @click="copyToClipboard" class="btn btn-secondary">
          Copy URL
        </button>
        <button @click="copyContent" class="btn btn-secondary">
          Copy Content
        </button>
      </div>
    </div>
    
    <div class="crash-log-content">
      <pre ref="codeElement"><code>{{ crashLog.content }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github.css'

// Import specific language support for stack traces
import java from 'highlight.js/lib/languages/java'
hljs.registerLanguage('java', java)

interface Props {
  crashLog: {
    id: string
    content: string
  }
}

const props = defineProps<Props>()
const codeElement = ref<HTMLElement>()
const versionPlaceholders = new Map<string, string>()

const highlightCode = () => {
  if (codeElement.value) {
    // Apply custom highlighting for crash logs
    const highlighted = highlightCrashLog(props.crashLog.content)
    codeElement.value.innerHTML = highlighted
  }
}

const redactIPs = (content: string): string => {
  // First, protect version numbers in Fabric modlist sections
  let protectedContent = content.replace(
    /(Loading \d+ mods:[\s\S]*?)(\d+(?:\.\d+)*(?:[+\-][a-zA-Z0-9._-]+)*)/gm,
    (match, prefix, version) => {
      // Generate a unique placeholder for this version
      const placeholder = `__VERSION_${Math.random().toString(36).substr(2, 9)}__`
      versionPlaceholders.set(placeholder, version)
      return prefix + placeholder
    }
  )
  
  // Protect version numbers in Fabric mod lines (- modname version)
  protectedContent = protectedContent.replace(
    /^(\s*[-|\\]\s*)(\w+)\s+(\d+(?:\.\d+)*(?:[+\-][a-zA-Z0-9._-]+)*)/gm,
    (match, prefix, modName, version) => {
      const placeholder = `__VERSION_${Math.random().toString(36).substr(2, 9)}__`
      versionPlaceholders.set(placeholder, version)
      return `${prefix}${modName} ${placeholder}`
    }
  )
  
  // Protect version numbers in general mod version patterns
  protectedContent = protectedContent.replace(
    /(\w+)\s+(\d+(?:\.\d+)*(?:[+\-][a-zA-Z0-9._-]+)*)/gm,
    (match, modName, version) => {
      // Only protect if this looks like a mod version (has letters/dashes/plus after numbers)
      if (version.match(/^\d+(?:\.\d+)*(?:[+\-][a-zA-Z0-9._-]+)*$/)) {
        const placeholder = `__VERSION_${Math.random().toString(36).substr(2, 9)}__`
        versionPlaceholders.set(placeholder, version)
        return `${modName} ${placeholder}`
      }
      return match
    }
  )
  
  // Now redact actual IP addresses (4 octets only)
  const redactedContent = protectedContent.replace(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '<span class="hljs-redacted">[REDACTED]</span>'
  )
  
  // Restore protected version numbers
  let finalContent = redactedContent
  versionPlaceholders.forEach((version, placeholder) => {
    finalContent = finalContent.replace(placeholder, version)
  })
  versionPlaceholders.clear()
  
  return finalContent
}

const highlightCrashLog = (content: string): string => {
  // First redact IPs while protecting version numbers
  const redactedContent = redactIPs(content)
  
  // Then apply highlighting
  return redactedContent
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
}

const copyToClipboard = () => {
  const url = `${window.location.origin}/crash/${props.crashLog.id}`
  navigator.clipboard.writeText(url)
}

const copyContent = () => {
  navigator.clipboard.writeText(props.crashLog.content)
}

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
  padding: 1rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.crash-log-actions {
  display: flex;
  gap: 0.5rem;
}

.crash-log-content {
  max-height: 80vh;
  overflow: auto;
}

.crash-log-content pre {
  margin: 0;
  padding: 1.5rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  background: #fafafa;
}

.crash-log-content code {
  background: none;
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
  
  .crash-log-content pre {
    padding: 1rem;
    font-size: 0.75rem;
  }
}
</style>