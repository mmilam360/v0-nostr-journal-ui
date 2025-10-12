"use client"

// Comprehensive relay management with fallback and health checking
export interface RelayHealth {
  url: string
  isHealthy: boolean
  lastChecked: Date
  responseTime?: number
  error?: string
}

export interface RelayConfig {
  primary: string[]
  fallback: string[]
  timeout: number
  maxRetries: number
}

// Curated list of reliable relays based on nostr.info directory and community feedback
const RELAY_CONFIG: RelayConfig = {
  primary: [
    "wss://relay.snort.social",        // High performance, good filter support
    "wss://nos.lol",                   // Reliable, supports all filter types
    "wss://relay.primal.net",          // Fast, good uptime
    "wss://relay.damus.io"             // Well-maintained, supports NIP-46
  ],
  fallback: [
    "wss://relay.nostr.band",          // Good performance
    "wss://relay.getalby.com/v1",      // Alby's relay, reliable
    "wss://relay.wine",                // Alternative option
    "wss://relay.nsec.app",            // Backup option
    "wss://nostr.mutinywallet.com",    // Mutiny's relay
    "wss://relay.bitcoiner.social",    // Bitcoin-focused, reliable
    "wss://relay.nostr.wine",          // Additional backup
    "wss://relay.nostrich.land"        // Community relay
  ],
  timeout: 15000, // 15 seconds - increased for better reliability
  maxRetries: 3
}

// Test relay connectivity
export async function testRelayHealth(url: string, timeout = RELAY_CONFIG.timeout): Promise<RelayHealth> {
  const startTime = Date.now()
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url)
      const timeoutId = setTimeout(() => {
        ws.close()
        resolve({
          url,
          isHealthy: false,
          lastChecked: new Date(),
          error: "Connection timeout"
        })
      }, timeout)

      ws.onopen = () => {
        clearTimeout(timeoutId)
        const responseTime = Date.now() - startTime
        ws.close()
        resolve({
          url,
          isHealthy: true,
          lastChecked: new Date(),
          responseTime
        })
      }

      ws.onerror = () => {
        clearTimeout(timeoutId)
        resolve({
          url,
          isHealthy: false,
          lastChecked: new Date(),
          error: "WebSocket error"
        })
      }
    } catch (error) {
      resolve({
        url,
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  })
}

// Get healthy relays with fallback
export async function getHealthyRelays(): Promise<string[]> {
  console.log("[NostrJournal] 🔍 Testing relay health...")
  
  const allRelays = [...RELAY_CONFIG.primary, ...RELAY_CONFIG.fallback]
  const healthChecks = await Promise.allSettled(
    allRelays.map(relay => testRelayHealth(relay))
  )
  
  const healthyRelays: string[] = []
  const unhealthyRelays: RelayHealth[] = []
  
  healthChecks.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const health = result.value
      if (health.isHealthy) {
        healthyRelays.push(health.url)
        console.log(`[v0] ✅ ${health.url} - ${health.responseTime}ms`)
      } else {
        unhealthyRelays.push(health)
        console.log(`[v0] ❌ ${health.url} - ${health.error}`)
      }
    } else {
      console.log(`[v0] ❌ ${allRelays[index]} - Test failed`)
    }
  })
  
  if (healthyRelays.length === 0) {
    console.error("[v0] 🚨 No healthy relays found! Using fallback list...")
    return RELAY_CONFIG.primary // Fallback to primary list even if unhealthy
  }
  
  console.log(`[v0] ✅ Found ${healthyRelays.length} healthy relays`)
  return healthyRelays
}

// Get relays with smart ordering (healthy first, then fallback)
export async function getSmartRelayList(): Promise<string[]> {
  const healthyRelays = await getHealthyRelays()
  
  // Prioritize primary relays that are healthy
  const primaryHealthy = RELAY_CONFIG.primary.filter(relay => 
    healthyRelays.includes(relay)
  )
  
  // Add remaining healthy relays
  const otherHealthy = healthyRelays.filter(relay => 
    !RELAY_CONFIG.primary.includes(relay)
  )
  
  // Combine with fallback for redundancy
  const smartList = [
    ...primaryHealthy,
    ...otherHealthy,
    ...RELAY_CONFIG.fallback.filter(relay => !healthyRelays.includes(relay))
  ]
  
  return smartList.slice(0, 3) // Limit to 3 relays for faster sync
}

// Legacy function for backward compatibility
export function getRelays(): string[] {
  if (typeof window === "undefined") return RELAY_CONFIG.primary
  
  const savedRelays = localStorage.getItem("nostr_user_relays")
  if (savedRelays) {
    try {
      return JSON.parse(savedRelays)
    } catch {
      return RELAY_CONFIG.primary
    }
  }
  
  return RELAY_CONFIG.primary
}

// Save custom relay configuration
export function saveRelays(relays: string[]): void {
  if (typeof window === "undefined") return
  
  try {
    localStorage.setItem("nostr_user_relays", JSON.stringify(relays))
    console.log("[NostrJournal] 💾 Saved relay configuration:", relays)
  } catch (error) {
    console.error("[v0] Failed to save relays:", error)
  }
}

// Get default relay configuration
export function getDefaultRelays(): string[] {
  return [...RELAY_CONFIG.primary]
}

// ===================================================================================
// RELAY POOL INTEGRATION
// ===================================================================================

// Initialize the persistent relay pool with smart relay selection
export async function initializePersistentRelayPool(): Promise<void> {
  try {
    // Relay pool initialization removed - using direct relay connections
    const smartRelays = await getSmartRelayList();
    initializeRelayPool(smartRelays);
    console.log('[RelayManager] Persistent relay pool initialized with', smartRelays.length, 'relays');
  } catch (error) {
    console.error('[RelayManager] Failed to initialize relay pool:', error);
    // Fallback to default relays
    // Relay pool initialization removed - using direct relay connections
    initializeRelayPool(RELAY_CONFIG.primary);
  }
}

// Get the persistent relay pool instance
export async function getPersistentRelayPool() {
  // Relay pool removed - using direct relay connections
  return null; // Relay pool removed
}

// Publish using the persistent pool
export async function publishWithPersistentPool(event: any, relays?: string[]) {
  // Relay pool removed - using direct relay connections
  return null; // Relay pool removed
}

// Subscribe using the persistent pool
export async function subscribeWithPersistentPool(
  filters: any[],
  relays?: string[],
  onEvent?: (event: any) => void,
  onEose?: () => void
) {
  // Relay pool removed - using direct relay connections
  return null; // Relay pool removed
}

// Get relay pool statistics
export async function getPersistentPoolStats() {
  // Relay pool removed - using direct relay connections
  return null; // Relay pool removed
}

// Shutdown the persistent pool (call on app unmount)
export async function shutdownPersistentRelayPool() {
  // Relay pool removed - using direct relay connections
  // Relay pool removed - no cleanup needed
}
