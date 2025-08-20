import { CrashLog } from '../models/CrashLog'

interface SearchResult {
  crashLogId: string
  score: number
  matches: {
    field: string
    context: string
    position: number
  }[]
}

interface IndexEntry {
  crashLogId: string
  field: string
  positions: number[]
  contextLength: number
}

interface SearchOptions {
  fuzzy?: boolean
  phrase?: boolean
  maxResults?: number
  minScore?: number
}

export class CrashLogSearchEngine {
  private invertedIndex = new Map<string, IndexEntry[]>()
  private documentStore = new Map<string, {
    content: string
    fields: Record<string, string>
  }>()
  private stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'among', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
  ])

  constructor() {
    console.log('CrashLogSearchEngine initialized')
  }

  /**
   * Tokenize text into searchable terms
   */
  private tokenize(text: string): string[] {
    const originalText = text.toLowerCase()
    const tokens = new Set<string>()
    
    // First pass: extract complete programming constructs
    const programmingPatterns = [
      // Java class names with packages
      /\b[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_$]*)+(?:\$[a-zA-Z0-9_$]+)*\b/g,
      // Exception class names
      /\b[A-Z][a-zA-Z0-9]*(?:Exception|Error)\b/gi,
      // Method signatures with parentheses
      /\b[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)/g,
      // File paths and extensions
      /\b[\w.-]+\.(?:jar|java|class|log)\b/g,
      // Version numbers
      /\b\d+\.\d+(?:\.\d+)*(?:[+-][a-zA-Z0-9_.-]+)?\b/g,
      // Hex addresses and numbers
      /\b0x[a-fA-F0-9]+\b/g,
      // Minecraft/mod specific terms
      /\b(?:minecraft|forge|fabric|quilt|neoforge|optifine|jei|create|thermal|mekanism|buildcraft)\b/gi
    ]
    
    // Extract complete patterns first
    programmingPatterns.forEach(pattern => {
      const matches = originalText.match(pattern) || []
      matches.forEach(match => tokens.add(match.toLowerCase()))
    })
    
    // Second pass: standard word tokenization (but preserve dots in class names)
    const words = originalText
      .split(/[\s,;!?\[\]{}()]+/)
      .filter(token => token.length > 1 && !this.stopWords.has(token))
    
    words.forEach(word => {
      tokens.add(word)
      
      // For dotted terms, also add the individual parts
      if (word.includes('.')) {
        word.split('.').forEach(part => {
          if (part.length > 1 && !this.stopWords.has(part)) {
            tokens.add(part)
          }
        })
      }
    })
    
    return Array.from(tokens)
  }

  /**
   * Extract all searchable content from a crash log
   */
  private extractContent(crashLog: CrashLog): Record<string, string> {
    const content: Record<string, string> = {}
    
    // Extract all file contents
    const allFileContent = crashLog.files.map(f => f.content).join('\n\n')
    content.files = allFileContent
    
    // Add other searchable fields
    if (crashLog.title) content.title = crashLog.title
    if (crashLog.description) content.description = crashLog.description
    if (crashLog.errorMessage) content.errorMessage = crashLog.errorMessage
    if (crashLog.stackTrace) content.stackTrace = crashLog.stackTrace
    if (crashLog.errorType) content.errorType = crashLog.errorType
    if (crashLog.culpritMod) content.culpritMod = crashLog.culpritMod
    if (crashLog.minecraftVersion) content.minecraftVersion = crashLog.minecraftVersion
    if (crashLog.modLoader) content.modLoader = crashLog.modLoader
    if (crashLog.modList) content.modList = crashLog.modList.join(' ')
    if (crashLog.tags) content.tags = crashLog.tags.join(' ')
    
    return content
  }

  /**
   * Add a crash log to the search index
   */
  public indexCrashLog(crashLog: CrashLog): void {
    const content = this.extractContent(crashLog)
    const fullContent = Object.values(content).join('\n')
    
    // Store the document
    this.documentStore.set(crashLog.id, {
      content: fullContent,
      fields: content
    })

    // Index each field
    for (const [fieldName, fieldContent] of Object.entries(content)) {
      const tokens = this.tokenize(fieldContent)
      const seenTokens = new Set<string>()
      
      tokens.forEach((token, index) => {
        if (seenTokens.has(token)) return
        seenTokens.add(token)
        
        // Find all positions of this token in the field
        const positions: number[] = []
        const lowerFieldContent = fieldContent.toLowerCase()
        let searchIndex = 0
        
        while (true) {
          const pos = lowerFieldContent.indexOf(token, searchIndex)
          if (pos === -1) break
          positions.push(pos)
          searchIndex = pos + 1
        }
        
        if (positions.length === 0) return
        
        // Add to inverted index
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, [])
        }
        
        this.invertedIndex.get(token)!.push({
          crashLogId: crashLog.id,
          field: fieldName,
          positions,
          contextLength: fieldContent.length
        })
      })
    }
    
    console.log(`Indexed crash log ${crashLog.id} with ${Object.keys(content).length} fields`)
  }

  /**
   * Remove a crash log from the search index
   */
  public removeFromIndex(crashLogId: string): void {
    // Remove from document store
    this.documentStore.delete(crashLogId)
    
    // Remove from inverted index
    for (const [token, entries] of this.invertedIndex.entries()) {
      const filteredEntries = entries.filter(entry => entry.crashLogId !== crashLogId)
      if (filteredEntries.length === 0) {
        this.invertedIndex.delete(token)
      } else {
        this.invertedIndex.set(token, filteredEntries)
      }
    }
  }

  /**
   * Get context around a match
   */
  private getContext(content: string, position: number, contextSize = 100): string {
    const start = Math.max(0, position - contextSize)
    const end = Math.min(content.length, position + contextSize)
    return content.slice(start, end)
  }

  /**
   * Calculate relevance score for a search result
   */
  private calculateScore(matches: IndexEntry[], query: string[]): number {
    let score = 0
    const queryTerms = new Set(query)
    const matchedTerms = new Set<string>()
    
    matches.forEach(match => {
      // Add points for each unique term matched
      if (!matchedTerms.has(match.field)) {
        score += 10
        matchedTerms.add(match.field)
      }
      
      // Boost score based on field importance
      const fieldBoosts: Record<string, number> = {
        errorMessage: 3,
        errorType: 2.5,
        stackTrace: 2,
        title: 1.5,
        files: 1,
        description: 1.2
      }
      score += (fieldBoosts[match.field] || 1) * match.positions.length
    })
    
    // Boost score for matching more query terms
    const termCoverage = matchedTerms.size / queryTerms.size
    score *= (1 + termCoverage)
    
    return score
  }

  /**
   * Perform fuzzy search using Levenshtein distance
   */
  private fuzzyMatch(term: string, maxDistance = 2): string[] {
    const matches: string[] = []
    
    for (const indexedTerm of this.invertedIndex.keys()) {
      if (this.levenshteinDistance(term, indexedTerm) <= maxDistance) {
        matches.push(indexedTerm)
      }
    }
    
    return matches
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix = []
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[b.length][a.length]
  }

  /**
   * Search for phrase matches
   */
  private searchPhrase(phrase: string): Map<string, IndexEntry[]> {
    const results = new Map<string, IndexEntry[]>()
    
    for (const [crashLogId, doc] of this.documentStore.entries()) {
      for (const [fieldName, fieldContent] of Object.entries(doc.fields)) {
        const lowerContent = fieldContent.toLowerCase()
        const lowerPhrase = phrase.toLowerCase()
        const positions: number[] = []
        
        let searchIndex = 0
        while (true) {
          const pos = lowerContent.indexOf(lowerPhrase, searchIndex)
          if (pos === -1) break
          positions.push(pos)
          searchIndex = pos + 1
        }
        
        if (positions.length > 0) {
          if (!results.has(crashLogId)) {
            results.set(crashLogId, [])
          }
          
          results.get(crashLogId)!.push({
            crashLogId,
            field: fieldName,
            positions,
            contextLength: fieldContent.length
          })
        }
      }
    }
    
    return results
  }

  /**
   * Main search method
   */
  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      fuzzy = false,
      phrase = false,
      maxResults = 50,
      minScore = 1
    } = options

    if (!query.trim()) return []

    const resultMap = new Map<string, IndexEntry[]>()

    if (phrase) {
      // Handle phrase search
      const phraseResults = this.searchPhrase(query)
      for (const [crashLogId, entries] of phraseResults.entries()) {
        resultMap.set(crashLogId, entries)
      }
    } else {
      // Handle term-based search
      const queryTerms = this.tokenize(query)
      const searchTerms = new Set<string>()
      
      // Add original terms
      queryTerms.forEach(term => searchTerms.add(term))
      
      // Add fuzzy matches if enabled
      if (fuzzy) {
        queryTerms.forEach(term => {
          const fuzzyMatches = this.fuzzyMatch(term)
          fuzzyMatches.forEach(match => searchTerms.add(match))
        })
      }
      
      // Find matching documents
      for (const term of searchTerms) {
        const entries = this.invertedIndex.get(term)
        if (!entries) continue
        
        for (const entry of entries) {
          if (!resultMap.has(entry.crashLogId)) {
            resultMap.set(entry.crashLogId, [])
          }
          resultMap.get(entry.crashLogId)!.push(entry)
        }
      }
    }

    // Convert to search results with scoring
    const searchResults: SearchResult[] = []
    
    for (const [crashLogId, entries] of resultMap.entries()) {
      const doc = this.documentStore.get(crashLogId)
      if (!doc) continue
      
      const score = this.calculateScore(entries, phrase ? [query] : this.tokenize(query))
      if (score < minScore) continue
      
      const matches = entries.map(entry => ({
        field: entry.field,
        context: this.getContext(doc.fields[entry.field], entry.positions[0]),
        position: entry.positions[0]
      }))
      
      searchResults.push({
        crashLogId,
        score,
        matches
      })
    }
    
    // Sort by score and limit results
    return searchResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
  }

  /**
   * Get search statistics
   */
  public getStats(): {
    totalDocuments: number
    totalTerms: number
    averageTermsPerDocument: number
  } {
    return {
      totalDocuments: this.documentStore.size,
      totalTerms: this.invertedIndex.size,
      averageTermsPerDocument: this.invertedIndex.size / Math.max(1, this.documentStore.size)
    }
  }

  /**
   * Clear all indexes
   */
  public clear(): void {
    this.invertedIndex.clear()
    this.documentStore.clear()
  }
}

// Global instance
export const searchEngine = new CrashLogSearchEngine()