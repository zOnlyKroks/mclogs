<template>
  <div class="crash-view">
    <div v-if="loading" class="loading">
      <p>Loading crash log...</p>
    </div>

    <div v-else-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-else-if="crashLog" class="crash-content">
      <div class="crash-header">
        <h1>{{ crashLog.title || `Crash Log ${formatDate(crashLog.createdAt)}` }}</h1>
        
        <div class="crash-meta">
          <div class="meta-grid">
            <div v-if="crashLog.minecraftVersion" class="meta-item">
              <span class="meta-label">Minecraft Version:</span>
              <span class="meta-value">{{ crashLog.minecraftVersion }}</span>
            </div>
            
            <div v-if="crashLog.modLoader" class="meta-item">
              <span class="meta-label">Mod Loader:</span>
              <span class="meta-value">
                {{ crashLog.modLoader }}
                {{ crashLog.modLoaderVersion ? `${crashLog.modLoaderVersion}` : '' }}
              </span>
            </div>
            
            <div v-if="crashLog.errorType" class="meta-item">
              <span class="meta-label">Error Type:</span>
              <span class="meta-value error-type">{{ crashLog.errorType }}</span>
            </div>
            
            <div v-if="crashLog.culpritMod" class="meta-item">
              <span class="meta-label">Likely Culprit:</span>
              <span class="meta-value culprit-mod">{{ crashLog.culpritMod }}</span>
            </div>
            
            <div class="meta-item">
              <span class="meta-label">Created:</span>
              <span class="meta-value">{{ formatDate(crashLog.createdAt) }}</span>
            </div>
            
            <div v-if="crashLog.expiresAt" class="meta-item">
              <span class="meta-label">Expires:</span>
              <span class="meta-value">{{ formatDate(crashLog.expiresAt) }}</span>
            </div>
          </div>
        </div>

        <div v-if="crashLog.errorMessage" class="error-message">
          <h3>Error Message:</h3>
          <code>{{ crashLog.errorMessage }}</code>
        </div>

        <div v-if="crashLog.modList && crashLog.modList.length > 0" class="mod-list">
          <h3>Detected Mods ({{ crashLog.modList.length }}):</h3>
          <div class="mod-tags">
            <a 
              v-for="mod in (showAllMods ? crashLog.modList : crashLog.modList.slice(0, 20))" 
              :key="mod" 
              :href="getModLink(mod)"
              target="_blank"
              rel="noopener noreferrer"
              class="tag mod-link"
              :class="{ 'culprit-tag': mod === crashLog.culpritMod }"
              :title="`View ${mod} on Modrinth/CurseForge`"
            >
              {{ mod }}
              <span v-if="mod === crashLog.culpritMod" class="culprit-indicator">⚠️</span>
            </a>
            <button 
              v-if="crashLog.modList.length > 20" 
              @click="showAllMods = !showAllMods"
              class="tag more-mods-btn"
            >
              {{ showAllMods ? 'Show less' : `+${crashLog.modList.length - 20} more` }}
            </button>
          </div>
        </div>
      </div>

      <CrashLogDisplay :crash-log="crashLog" />

      <CommentSection 
        :crash-log-id="crashLog.id" 
        :is-expired="crashLog.expiresAt ? new Date() > crashLog.expiresAt : false"
      />

      <div class="related-section">
        <h3>Find Similar Crashes</h3>
        <div class="related-searches">
          <router-link 
            v-if="crashLog.errorType"
            :to="{ name: 'search', query: { errorType: crashLog.errorType } }"
            class="btn btn-secondary"
          >
            Same Error Type
          </router-link>
          
          <router-link 
            v-if="crashLog.minecraftVersion"
            :to="{ name: 'search', query: { minecraftVersion: crashLog.minecraftVersion } }"
            class="btn btn-secondary"
          >
            Same MC Version
          </router-link>
          
          <router-link 
            v-if="crashLog.modLoader"
            :to="{ name: 'search', query: { modLoader: crashLog.modLoader } }"
            class="btn btn-secondary"
          >
            Same Mod Loader
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ApiService } from '../services/api'
import { ModLinkService } from '../services/modLinks'
import CrashLogDisplay from '../components/CrashLogDisplay.vue'
import CommentSection from '../components/CommentSection.vue'
import type { CrashLog } from '../types'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const crashLog = ref<CrashLog | null>(null)
const showAllMods = ref(false)

const loadCrashLog = async () => {
  const id = route.params.id as string
  
  if (!id) {
    error.value = 'Invalid crash log ID'
    loading.value = false
    return
  }

  try {
    crashLog.value = await ApiService.getCrashLog(id)
  } catch (err: any) {
    if (err.response?.status === 404) {
      error.value = 'Crash log not found'
    } else if (err.response?.status === 410) {
      error.value = 'This crash log has expired'
    } else {
      error.value = 'Failed to load crash log'
    }
  } finally {
    loading.value = false
  }
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getModLink = (modName: string) => {
  return ModLinkService.getPrimaryLink(modName)
}

onMounted(() => {
  loadCrashLog()
})
</script>

<style scoped>
.crash-header {
  margin-bottom: 2rem;
}

.crash-header h1 {
  font-size: 2rem;
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.crash-meta {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meta-label {
  font-weight: 600;
  color: #6c757d;
  font-size: 0.875rem;
}

.meta-value {
  font-size: 1rem;
  color: #2c3e50;
}

.error-type {
  color: #d73a49;
  font-weight: 600;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.culprit-mod {
  color: #d73a49;
  font-weight: 600;
  background: #fff5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  border: 1px solid #fed7d7;
}

.error-message {
  background: #fff5f5;
  border: 1px solid #fed7d7;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.error-message h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #c53030;
}

.error-message code {
  background: #fed7d7;
  color: #c53030;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  display: block;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  word-break: break-word;
}

.mod-list {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.mod-list h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.mod-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.more-mods-btn {
  background: #6c757d !important;
  color: white !important;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.more-mods-btn:hover {
  background: #5a6268 !important;
}

.mod-link {
  color: inherit;
  text-decoration: none;
  transition: all 0.2s;
  position: relative;
}

.mod-link:hover {
  background: #42b883;
  color: white;
  transform: translateY(-1px);
}

.culprit-tag {
  background: #d73a49 !important;
  color: white !important;
  font-weight: 600;
}

.culprit-tag:hover {
  background: #c53030 !important;
}

.culprit-indicator {
  margin-left: 0.25rem;
  font-size: 0.8em;
}

.related-section {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #e9ecef;
}

.related-section h3 {
  margin-bottom: 1rem;
}

.related-searches {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

@media (max-width: 768px) {
  .crash-header h1 {
    font-size: 1.5rem;
  }
  
  .meta-grid {
    grid-template-columns: 1fr;
  }
  
  .crash-meta,
  .mod-list {
    padding: 1rem;
  }
  
  .related-searches {
    flex-direction: column;
  }
}
</style>