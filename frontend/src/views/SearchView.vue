<template>
  <div class="search">
    <div class="search-header">
      <h1>Search Crash Logs</h1>
      <p>Search through submitted Minecraft crash logs and stack traces</p>
    </div>

    <form @submit.prevent="() => performSearch()" class="search-form">
      <div class="search-grid">
        <div class="form-group">
          <label for="query" class="form-label">Search Text</label>
          <input
            id="query"
            v-model="searchForm.q"
            type="text"
            class="form-input"
            placeholder="Error message, exception, or mod name..."
          />
        </div>

        <div class="form-group">
          <label for="minecraft-version" class="form-label">Minecraft Version</label>
          <select id="minecraft-version" v-model="searchForm.minecraftVersion" class="form-select">
            <option value="">Any Version</option>
            <optgroup v-if="releaseVersions.length > 0" label="Release Versions">
              <option 
                v-for="version in releaseVersions" 
                :key="version.id" 
                :value="version.id"
              >
                {{ version.id }}
                <span v-if="version.id === latestVersion.release"> (Latest)</span>
              </option>
            </optgroup>
            <optgroup v-if="showSnapshots && snapshotVersions.length > 0" label="Snapshots">
              <option 
                v-for="version in snapshotVersions.slice(0, 20)" 
                :key="version.id" 
                :value="version.id"
              >
                {{ version.id }}
                <span v-if="version.id === latestVersion.snapshot"> (Latest Snapshot)</span>
              </option>
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="mod-loader" class="form-label">Mod Loader</label>
          <select id="mod-loader" v-model="searchForm.modLoader" class="form-select">
            <option value="">Any Loader</option>
            <option value="forge">Forge</option>
            <option value="fabric">Fabric</option>
            <option value="quilt">Quilt</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </div>

        <div class="form-group">
          <label for="error-type" class="form-label">Error Type</label>
          <input
            id="error-type"
            v-model="searchForm.errorType"
            type="text"
            class="form-input"
            placeholder="NullPointerException, ClassNotFound..."
          />
        </div>

        <div class="form-group">
          <label for="mod" class="form-label">Specific Mod</label>
          <input
            id="mod"
            v-model="searchForm.mod"
            type="text"
            class="form-input"
            placeholder="jei, optifine, create..."
          />
        </div>

        <div class="form-group search-actions">
          <button type="submit" class="btn" :disabled="isSearching">
            {{ isSearching ? 'Searching...' : 'Search' }}
          </button>
          <button type="button" @click="clearForm" class="btn btn-secondary">
            Clear
          </button>
          <button 
            type="button" 
            @click="toggleSnapshots" 
            class="btn btn-tertiary"
            :class="{ 'active': showSnapshots }"
          >
            {{ showSnapshots ? 'Hide' : 'Show' }} Snapshots
          </button>
        </div>
      </div>
    </form>

    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="versionLoadError" class="alert alert-warning">
      {{ versionLoadError }}
    </div>

    <div v-if="searchResults" class="search-results">
      <div class="results-header">
        <h2>Search Results</h2>
        <p>{{ searchResults.totalResults }} results found</p>
      </div>

      <div v-if="searchResults.results.length === 0" class="no-results">
        <p>No crash logs found matching your criteria.</p>
        <p>Try adjusting your search terms or filters.</p>
      </div>

      <div v-else class="results-list">
        <article
          v-for="result in searchResults.results"
          :key="result.id"
          class="search-result"
        >
          <router-link :to="`/crash/${result.id}`" class="search-result-title">
            <h3>{{ result.title || `Crash ${formatDate(result.createdAt)}` }}</h3>
          </router-link>

          <div class="search-result-meta">
            <span v-if="result.minecraftVersion">
              Minecraft {{ result.minecraftVersion }}
            </span>
            <span v-if="result.modLoader">
              {{ result.modLoader }}{{ result.modLoaderVersion ? ` ${result.modLoaderVersion}` : '' }}
            </span>
            <span v-if="result.errorType">
              {{ result.errorType }}
            </span>
            <span>{{ formatDate(result.createdAt) }}</span>
          </div>

          <div v-if="result.errorMessage" class="search-result-error">
            <code>{{ result.errorMessage }}</code>
          </div>

          <div v-if="result.modList && result.modList.length > 0" class="search-result-tags">
            <span class="tag" v-for="mod in result.modList.slice(0, 8)" :key="mod">
              {{ mod }}
            </span>
            <span v-if="result.modList.length > 8" class="tag">
              +{{ result.modList.length - 8 }} more
            </span>
          </div>
        </article>
      </div>

      <div v-if="searchResults.results.length >= 20" class="pagination">
        <button
          @click="loadMore"
          class="btn btn-secondary"
          :disabled="isLoadingMore"
        >
          {{ isLoadingMore ? 'Loading...' : 'Load More' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiService } from '../services/api'
import type { SearchResponse, SearchParams } from '../types'

interface MinecraftVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  time: string
  releaseTime: string
}

interface VersionManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: MinecraftVersion[]
}

const route = useRoute()
const router = useRouter()

const searchForm = reactive<SearchParams>({
  q: '',
  minecraftVersion: '',
  modLoader: '',
  errorType: '',
  mod: '',
  limit: 20,
  offset: 0
})

const isSearching = ref(false)
const isLoadingMore = ref(false)
const error = ref('')
const versionLoadError = ref('')
const searchResults = ref<SearchResponse | null>(null)

const allVersions = ref<MinecraftVersion[]>([])
const latestVersion = ref({ release: '', snapshot: '' })
const showSnapshots = ref(false)

const releaseVersions = computed(() => 
  allVersions.value
    .filter(version => version.type === 'release')
    .slice(0, 99)
)

const snapshotVersions = computed(() => 
  allVersions.value
    .filter(version => version.type === 'snapshot')
    .slice(0, 99)
)

const loadMinecraftVersions = async () => {
  try {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data: VersionManifest = await response.json()
    allVersions.value = data.versions
    latestVersion.value = data.latest
    
    console.log(`Loaded ${data.versions.length} Minecraft versions`)
    console.log(`Latest release: ${data.latest.release}`)
    console.log(`Latest snapshot: ${data.latest.snapshot}`)
  } catch (err: any) {
    console.error('Failed to load Minecraft versions:', err)
    versionLoadError.value = 'Failed to load Minecraft versions.'
  }
}

const performSearch = async (loadMore = false) => {
  if (loadMore) {
    isLoadingMore.value = true
    searchForm.offset = searchResults.value?.results.length || 0
  } else {
    isSearching.value = true
    searchForm.offset = 0
  }
  
  error.value = ''

  try {
    const results = await ApiService.searchCrashLogs(searchForm)
    
    if (loadMore && searchResults.value) {
      searchResults.value.results.push(...results.results)
    } else {
      searchResults.value = results
    }

    if (!loadMore) {
      updateUrlParams()
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Search failed'
  } finally {
    isSearching.value = false
    isLoadingMore.value = false
  }
}

const loadMore = () => {
  performSearch(true)
}

const clearForm = () => {
  Object.keys(searchForm).forEach(key => {
    if (key === 'limit') return
    ;(searchForm as any)[key] = key === 'offset' ? 0 : ''
  })
  searchResults.value = null
  router.replace({ query: {} })
}

const toggleSnapshots = () => {
  showSnapshots.value = !showSnapshots.value
}

const updateUrlParams = () => {
  const query: any = {}
  Object.entries(searchForm).forEach(([key, value]) => {
    if (value && key !== 'limit' && key !== 'offset') {
      query[key] = value
    }
  })
  router.replace({ query })
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(async () => {
  await loadMinecraftVersions()
  
  const query = route.query
  Object.keys(searchForm).forEach(key => {
    if (query[key] && key !== 'limit' && key !== 'offset') {
      ;(searchForm as any)[key] = query[key]
    }
  })
  
  const hasParams = Object.values(query).some(v => v && v !== '')
  if (hasParams) {
    performSearch()
  }
})
</script>

<style scoped>
.search-header {
  text-align: center;
  margin-bottom: 2rem;
}

.search-header h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.search-header p {
  font-size: 1.2rem;
  color: #6c757d;
}

.search-form {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  align-items: end;
}

.search-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-tertiary {
  background: #e9ecef;
  color: #6c757d;
  border: 1px solid #ced4da;
}

.btn-tertiary:hover {
  background: #dee2e6;
  color: #495057;
}

.btn-tertiary.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.alert-warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.search-results {
  margin-top: 2rem;
}

.results-header {
  margin-bottom: 1.5rem;
}

.results-header h2 {
  margin-bottom: 0.5rem;
}

.results-header p {
  color: #6c757d;
  margin: 0;
}

.no-results {
  text-align: center;
  padding: 3rem;
  color: #6c757d;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.search-result {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.2s;
}

.search-result:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.search-result-title {
  text-decoration: none;
}

.search-result-title h3 {
  color: #2c3e50;
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.search-result-title:hover h3 {
  color: #007bff;
}

.search-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #6c757d;
}

.search-result-meta span {
  padding: 0.25rem 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
}

.search-result-error {
  margin: 0.5rem 0;
}

.search-result-error code {
  background: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-size: 0.875rem;
  color: #e74c3c;
}

.search-result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  background: #007bff;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.pagination {
  text-align: center;
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .search-header h1 {
    font-size: 2rem;
  }
  
  .search-form {
    padding: 1rem;
  }
  
  .search-grid {
    grid-template-columns: 1fr;
  }
  
  .search-actions {
    flex-direction: column;
  }
  
  .search-result-meta {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>