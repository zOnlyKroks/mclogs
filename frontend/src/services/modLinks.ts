// Utility to get mod download/info links
export class ModLinkService {
  private static modSites = {
    curseforge: 'https://www.curseforge.com/minecraft/mc-mods/',
    modrinth: 'https://modrinth.com/mod/',
    github: 'https://github.com/search?q=',
  }

  // Known mod mappings for direct links
  private static knownMods: Record<string, { 
    curseforge?: string, 
    modrinth?: string, 
    github?: string 
  }> = {
    'jei': { 
      curseforge: 'jei',
      modrinth: 'jei' 
    },
    'optifine': { 
      curseforge: 'optifine' 
    },
    'sodium': { 
      curseforge: 'sodium',
      modrinth: 'sodium',
      github: 'CaffeineMC/sodium-fabric'
    },
    'iris': { 
      curseforge: 'irisshaders',
      modrinth: 'iris',
      github: 'IrisShaders/Iris'
    },
    'create': { 
      curseforge: 'create',
      modrinth: 'create' 
    },
    'architectury': {
      curseforge: 'architectury-api',
      modrinth: 'architectury-api'
    },
    'fabric-api': {
      curseforge: 'fabric-api',
      modrinth: 'fabric-api',
      github: 'FabricMC/fabric'
    },
    'effective': {
      curseforge: 'effective',
      modrinth: 'effective'
    },
    'dynamic_fps': {
      curseforge: 'dynamic-fps',
      modrinth: 'dynamic-fps'
    },
    'c2me': {
      curseforge: 'c2me-fabric',
      modrinth: 'c2me-fabric',
      github: 'RelativityMC/C2ME-fabric'
    },
    'immediatelyfast': {
      curseforge: 'immediatelyfast',
      modrinth: 'immediatelyfast'
    }
  }

  static getModLinks(modName: string): { 
    curseforge?: string, 
    modrinth?: string, 
    github?: string 
  } {
    const normalizedName = modName.toLowerCase()
    const knownMod = this.knownMods[normalizedName]
    
    if (knownMod) {
      return {
        curseforge: knownMod.curseforge ? `${this.modSites.curseforge}${knownMod.curseforge}` : undefined,
        modrinth: knownMod.modrinth ? `${this.modSites.modrinth}${knownMod.modrinth}` : undefined,
        github: knownMod.github ? `https://github.com/${knownMod.github}` : undefined
      }
    }

    // Fallback to search URLs
    return {
      curseforge: `${this.modSites.curseforge}search?search=${encodeURIComponent(modName)}`,
      modrinth: `${this.modSites.modrinth}?q=${encodeURIComponent(modName)}`,
      github: `${this.modSites.github}${encodeURIComponent(modName + ' minecraft mod')}`
    }
  }

  static getPrimaryLink(modName: string): string {
    const links = this.getModLinks(modName)
    
    // Prefer known direct links in order: modrinth -> curseforge -> github
    if (links.modrinth && !links.modrinth.includes('search') && !links.modrinth.includes('?q=')) {
      return links.modrinth
    }
    if (links.curseforge && !links.curseforge.includes('search')) {
      return links.curseforge
    }
    if (links.github && !links.github.includes('search')) {
      return links.github
    }

    // Fallback to Modrinth search
    return links.modrinth || `${this.modSites.modrinth}?q=${encodeURIComponent(modName)}`
  }
}