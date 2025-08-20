export interface ParsedCrashData {
  minecraftVersion?: string
  modLoader?: string
  modLoaderVersion?: string
  modList?: string[]
  errorType?: string
  errorMessage?: string
  stackTrace?: string
  culpritMod?: string
}

export class CrashParser {
  static parse(content: string): ParsedCrashData {
    const result: ParsedCrashData = {}

    // Extract Minecraft version
    const mcVersionMatch = content.match(/Loading Minecraft ([0-9.]+)|Minecraft Version: ([0-9.]+)|minecraft (\d+\.\d+\.?\d*)/i)
    if (mcVersionMatch) {
      result.minecraftVersion = mcVersionMatch[1] || mcVersionMatch[2] || mcVersionMatch[3]
    }

    // Extract mod loader info
    const forgeMatch = content.match(/Forge Version: ([0-9.-]+)|MinecraftForge (\S+)/i)
    if (forgeMatch) {
      result.modLoader = 'forge'
      result.modLoaderVersion = forgeMatch[1] || forgeMatch[2]
    }

    const fabricMatch = content.match(/with Fabric Loader ([0-9.]+)|Fabric Loader (\S+)|fabric-loader (\S+)/i)
    if (fabricMatch) {
      result.modLoader = 'fabric'
      result.modLoaderVersion = fabricMatch[1] || fabricMatch[2] || fabricMatch[3]
    }

    const quiltMatch = content.match(/Quilt Loader (\S+)/i)
    if (quiltMatch) {
      result.modLoader = 'quilt'
      result.modLoaderVersion = quiltMatch[1]
    }

    const neoforgeMatch = content.match(/NeoForge (\S+)/i)
    if (neoforgeMatch) {
      result.modLoader = 'neoforge'
      result.modLoaderVersion = neoforgeMatch[1]
    }

    // Extract mod list
    result.modList = this.extractModList(content)

    // Extract error information
    const errorInfo = this.extractErrorInfo(content)
    result.errorType = errorInfo.errorType
    result.errorMessage = errorInfo.errorMessage
    result.stackTrace = errorInfo.stackTrace
    result.culpritMod = errorInfo.culpritMod

    return result
  }

  private static extractModList(content: string): string[] {
    const mods = new Set<string>()

    // Extract from Fabric mod loading section
    const fabricModSection = content.match(/Loading \d+ mods:([\s\S]*?)(?=\[|$)/i)
    if (fabricModSection) {
      const modLines = fabricModSection[1].split('\n')
      for (const line of modLines) {
        // Match patterns like "    - accessories 1.3.3-beta+1.21.8"
        const fabricModMatch = line.match(/^\s*- (\w+)\s+[0-9]/i)
        if (fabricModMatch) {
          const modName = fabricModMatch[1].toLowerCase()
          if (!this.isCommonWord(modName) && modName !== 'minecraft' && modName !== 'java' && modName !== 'fabricloader') {
            mods.add(modName)
          }
        }
      }
    }

    // Common mod list patterns (fallback)
    const modPatterns = [
      /Loaded mod (\w+)/g,
      /Mod (\w+) version/gi,
      /from mod (\w+)/gi
    ]

    for (const pattern of modPatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const modName = match[1].toLowerCase()
        if (modName.length > 2 && !this.isCommonWord(modName)) {
          mods.add(modName)
        }
      }
    }

    // Extract from forge mod sections
    const modSectionMatch = content.match(/-- Mod List --[\s\S]*?(?=--|\n\n|$)/i)
    if (modSectionMatch) {
      const modLines = modSectionMatch[0].split('\n')
      for (const line of modLines) {
        const modMatch = line.match(/(\w+)\s*\|/i)
        if (modMatch) {
          mods.add(modMatch[1].toLowerCase())
        }
      }
    }

    return Array.from(mods).slice(0, 50) // Limit to 50 mods
  }

  private static extractErrorInfo(content: string): {
    errorType?: string
    errorMessage?: string
    stackTrace?: string
    culpritMod?: string
  } {
    const result: any = {}

    // Check for Mixin crashes first (very common in modded Minecraft)
    const mixinErrorMatch = content.match(/Mixin apply for mod (\w+) failed.*?:.*?(\w+Exception|Error):(.*?)$/m)
    if (mixinErrorMatch) {
      result.errorType = 'MixinApplyError'
      result.errorMessage = `Mixin failure in mod '${mixinErrorMatch[1]}': ${mixinErrorMatch[3]?.trim()}`
      result.culpritMod = mixinErrorMatch[1]
    }

    const mixinTransformError = content.match(/Mixin transformation of ([\w.]+) failed/)
    if (mixinTransformError) {
      result.errorType = 'MixinTransformationError'
      result.errorMessage = `Mixin transformation failed for ${mixinTransformError[1]}`
      // Try to extract mod from class name
      const classPath = mixinTransformError[1]
      const modFromPath = content.match(new RegExp(`from mod (\\w+).*${classPath}`, 'i'))
      if (modFromPath) {
        result.culpritMod = modFromPath[1]
      }
    }

    // Check for other mod-specific errors
    const modErrorMatch = content.match(/from mod (\w+).*?(Exception|Error)/i)
    if (modErrorMatch && !result.culpritMod) {
      result.culpritMod = modErrorMatch[1]
    }

    // Extract main exception (fallback)
    if (!result.errorType) {
      const exceptionMatch = content.match(/(java\.lang\.\w+Exception|Exception in thread.*?):(.*?)$/m)
      if (exceptionMatch) {
        result.errorType = exceptionMatch[1].split('.').pop()
        result.errorMessage = exceptionMatch[2]?.trim()
      }
    }

    // Extract stack trace - more comprehensive approach
    let stackTrace = ''
    
    // Look for full exception with stack trace
    const fullExceptionMatch = content.match(/((?:java\.lang\.|Exception|Error).*?(?:\n.*?at\s+.*?)*)(?=\n\n|-- |$)/ms)
    if (fullExceptionMatch) {
      stackTrace = fullExceptionMatch[1]
    } else {
      // Fallback: just look for stack trace lines
      const stackTraceMatch = content.match(/(at\s+[\w.$]+[\s\S]*?)(?=\n\n|-- |$)/m)
      if (stackTraceMatch) {
        stackTrace = stackTraceMatch[1]
      }
    }
    
    // Also include Caused by exceptions
    const causedByMatches = content.matchAll(/Caused by: (.*?(?:\n.*?at\s+.*?)*)/gms)
    for (const match of causedByMatches) {
      if (match[1]) {
        stackTrace += '\nCaused by: ' + match[1]
      }
    }
    
    if (stackTrace) {
      // Limit to reasonable size but include full context
      const lines = stackTrace.split('\n').slice(0, 50)
      result.stackTrace = lines.join('\n')
    }

    // Common crash types (if not already detected)
    if (!result.errorType) {
      const crashTypes = [
        'InvalidMixinException',
        'MixinApplyError', 
        'NullPointerException',
        'ClassNotFoundException',
        'NoSuchMethodError',
        'OutOfMemoryError',
        'ConcurrentModificationException',
        'IllegalStateException',
        'FormattedException'
      ]

      for (const crashType of crashTypes) {
        if (content.includes(crashType)) {
          result.errorType = crashType
          break
        }
      }
    }

    return result
  }

  private static isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
      'how', 'man', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did',
      'its', 'let', 'put', 'say', 'she', 'too', 'use'
    ]
    return commonWords.includes(word.toLowerCase())
  }
}