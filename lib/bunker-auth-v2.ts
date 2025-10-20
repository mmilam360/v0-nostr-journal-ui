/**
 * Modern Bunker Authentication using nostr-tools v2
 * Implements proper BunkerSigner with fast reconnect and mobile UX improvements
 */

import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'

// Debug logging utility for mobile debugging
const log = (message: string) => {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
  const logEntry = `[${timestamp}] ${message}`
  console.log(logEntry)
  
  // Store in sessionStorage so you can view on mobile
  try {
    const logs = JSON.parse(sessionStorage.getItem('debug_logs') || '[]')
    logs.push(logEntry)
    sessionStorage.setItem('debug_logs', JSON.stringify(logs.slice(-30))) // Keep last 30
  } catch (error) {
    // Ignore sessionStorage errors on some mobile browsers
  }
}

// Clear debug logs utility
export function clearDebugLogs(): void {
  try {
    sessionStorage.removeItem('debug_logs')
    console.log('[BunkerAuth] Debug logs cleared')
  } catch (error) {
    // Ignore sessionStorage errors
  }
}

// Auth state management
export type AuthState = 
  | { status: 'disconnected' }
  | { status: 'connecting', method: 'qr' | 'bunker' }
  | { status: 'waiting_approval' }
  | { status: 'connected', pubkey: string, signer: BunkerSigner }
  | { status: 'error', error: string }

// Session data structure for persistence
export interface BunkerSession {
  localSecretKey: Uint8Array
  remotePubkey: string
  relays: string[]
  connectedAt: number
  expiresAt: number
}

// Session storage keys
const SESSION_KEY = 'nostr_bunker_session_v2'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Generate a new client keypair for NIP-46 authentication
 */
export function generateClientKeypair(): { secretKey: Uint8Array; pubkey: string } {
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  return { secretKey, pubkey }
}

/**
 * Create a nostrconnect URI for QR code display
 */
export function createConnectURI(
  clientPubkey: string,
  secret: string,
  relays: string[],
  appMetadata: { name: string; url: string; description: string }
): string {
  return createNostrConnectURI({
    clientPubkey,
    secret,
    relays,
    ...appMetadata
  })
}

/**
 * Save bunker session to localStorage for fast reconnect
 */
export function saveBunkerSession(session: BunkerSession): void {
  try {
    // Convert Uint8Array to array for JSON serialization
    const sessionData = {
      ...session,
      localSecretKey: Array.from(session.localSecretKey)
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
    console.log('[BunkerAuth] 💾 Session saved for fast reconnect')
  } catch (error) {
    console.error('[BunkerAuth] ❌ Failed to save session:', error)
  }
}

/**
 * Load bunker session from localStorage
 */
export function loadBunkerSession(): BunkerSession | null {
  try {
    const sessionData = localStorage.getItem(SESSION_KEY)
    if (!sessionData) return null

    const parsed = JSON.parse(sessionData)
    
    // Check if session is expired
    if (Date.now() > parsed.expiresAt) {
      console.log('[BunkerAuth] ⏰ Session expired, clearing')
      clearBunkerSession()
      return null
    }

    // Convert array back to Uint8Array
    return {
      ...parsed,
      localSecretKey: new Uint8Array(parsed.localSecretKey)
    }
  } catch (error) {
    console.error('[BunkerAuth] ❌ Failed to load session:', error)
    return null
  }
}

/**
 * Clear bunker session from localStorage
 */
export function clearBunkerSession(): void {
  localStorage.removeItem(SESSION_KEY)
  console.log('[BunkerAuth] 🧹 Session cleared')
}

/**
 * Connect to remote signer using QR code flow (client-initiated)
 */
export async function connectViaQR(
  localSecretKey: Uint8Array,
  relay: string,
  appMetadata: { name: string; url: string; description: string },
  onStateChange: (state: AuthState) => void
): Promise<BunkerSigner | null> {
  try {
    log('Starting QR bunker connection...')
    onStateChange({ status: 'connecting', method: 'qr' })
    
    const localPubkey = getPublicKey(localSecretKey)
    
    // Convert secret key to hex string for URI
    const secretHex = Array.from(localSecretKey).map(b => b.toString(16).padStart(2, '0')).join('')
    
    const connectURI = createConnectURI(localPubkey, secretHex, [relay], appMetadata)
    
    log(`Generated connect URI: ${connectURI.substring(0, 50)}...`)
    log('Waiting for user to scan QR code...')
    
    onStateChange({ status: 'waiting_approval' })
    
    // Create signer and wait for connection
    log('Creating BunkerSigner...')
    const signer = new BunkerSigner(localSecretKey, relay, {
      ...appMetadata
    })
    
    // Set up connection timeout (reduced to 30s for mobile)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        log('Connection timeout after 30s')
        reject(new Error('Connection timed out'))
      }, 30000) // 30 second timeout for mobile
    })
    
    // Wait for connection with timeout wrapper
    log('Waiting for bunker response...')
    const connectionPromise = signer.connect()
    
    await Promise.race([connectionPromise, timeoutPromise])
    log('BunkerSigner connected successfully!')
    
    // Test connection
    const remotePubkey = await signer.getPublicKey()
    log(`Connected to remote signer: ${remotePubkey}`)
    
    // Save session for fast reconnect
    const session: BunkerSession = {
      localSecretKey,
      remotePubkey,
      relays: [relay],
      connectedAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION
    }
    saveBunkerSession(session)
    
    onStateChange({ status: 'connected', pubkey: remotePubkey, signer })
    return signer
    
  } catch (error) {
    log(`QR connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    onStateChange({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Connection failed'
    })
    return null
  }
}

/**
 * Connect to remote signer using bunker URL (signer-initiated)
 */
export async function connectViaBunker(
  bunkerUrl: string,
  onStateChange: (state: AuthState) => void
): Promise<BunkerSigner | null> {
  try {
    log('Starting bunker URL connection...')
    onStateChange({ status: 'connecting', method: 'bunker' })
    
    log(`Connecting to bunker: ${bunkerUrl}`)
    
    // Generate new client keypair
    const { secretKey, pubkey } = generateClientKeypair()
    
    // Create signer from bunker URL with timeout wrapper
    log('Creating BunkerSigner from bunker URL...')
    const signer = await Promise.race([
      BunkerSigner.fromBunker(secretKey, bunkerUrl),
      new Promise<never>((_, reject) => 
        setTimeout(() => {
          log('BunkerSigner creation timeout after 30s')
          reject(new Error('BunkerSigner creation timed out'))
        }, 30000)
      )
    ])
    log('BunkerSigner created successfully!')
    
    log('Waiting for approval...')
    onStateChange({ status: 'waiting_approval' })
    
    // Set up connection timeout (reduced to 30s for mobile)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        log('Connection timeout after 30s')
        reject(new Error('Connection timed out'))
      }, 30000) // 30 second timeout for mobile
    })
    
    // Wait for connection with timeout wrapper
    log('Waiting for bunker response...')
    const connectionPromise = signer.connect()
    
    await Promise.race([connectionPromise, timeoutPromise])
    log('BunkerSigner connected successfully!')
    
    // Test connection
    const remotePubkey = await signer.getPublicKey()
    log(`Connected to remote signer: ${remotePubkey}`)
    
    // Save session for fast reconnect
    const session: BunkerSession = {
      localSecretKey: secretKey,
      remotePubkey,
      relays: [extractRelayFromBunkerUrl(bunkerUrl)],
      connectedAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION
    }
    saveBunkerSession(session)
    
    onStateChange({ status: 'connected', pubkey: remotePubkey, signer })
    return signer
    
  } catch (error) {
    log(`Bunker connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    onStateChange({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Connection failed'
    })
    return null
  }
}

/**
 * Fast reconnect using saved session
 */
export async function fastReconnect(
  onStateChange: (state: AuthState) => void
): Promise<BunkerSigner | null> {
  try {
    const session = loadBunkerSession()
    if (!session) {
      console.log('[BunkerAuth] ℹ️ No saved session found')
      return null
    }
    
    console.log('[BunkerAuth] 🔄 Attempting fast reconnect...')
    
    // Create signer from session data
    const signer = new BunkerSigner(
      session.localSecretKey,
      session.relays[0], // Use first relay
      {
        name: 'Nostr Journal',
        url: window.location.origin,
        description: 'Encrypted journaling with Lightning incentives'
      }
    )
    
    // Test connection with ping
    await signer.ping()
    
    console.log('[BunkerAuth] ✅ Fast reconnect successful')
    onStateChange({ status: 'connected', pubkey: session.remotePubkey, signer })
    return signer
    
  } catch (error) {
    console.log('[BunkerAuth] ❌ Fast reconnect failed, clearing session:', error)
    clearBunkerSession()
    onStateChange({ status: 'disconnected' })
    return null
  }
}

/**
 * Extract relay URL from bunker URL
 */
function extractRelayFromBunkerUrl(bunkerUrl: string): string {
  try {
    const url = new URL(bunkerUrl)
    const relay = url.searchParams.get('relay')
    const extractedRelay = relay || 'wss://relay.nsecbunker.com'
    log(`Using relay: ${extractedRelay}`)
    return extractedRelay
  } catch {
    log('Using fallback relay: wss://relay.nsecbunker.com')
    return 'wss://relay.nsecbunker.com'
  }
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  return window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Check if nostrconnect:// links are supported
 */
export function supportsNostrConnect(): boolean {
  return 'protocolHandler' in navigator || isMobile()
}
