/**
 * Modern Bunker Authentication using nostr-tools v2
 * Implements proper BunkerSigner with fast reconnect and mobile UX improvements
 */

import { BunkerSigner, createNostrConnectURI } from '@nostr/tools/nip46'
import { generateSecretKey, getPublicKey } from '@nostr/tools/pure'
import { SimplePool } from '@nostr/tools/pool'

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
  localPubkey: string,
  relay: string,
  appMetadata: { name: string; url: string; description: string }
): string {
  return createNostrConnectURI({
    localPubkey,
    relay,
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
    onStateChange({ status: 'connecting', method: 'qr' })
    
    const localPubkey = getPublicKey(localSecretKey)
    const connectURI = createConnectURI(localPubkey, relay, appMetadata)
    
    console.log('[BunkerAuth] 📱 Generated connect URI:', connectURI)
    console.log('[BunkerAuth] 📱 Waiting for user to scan QR code...')
    
    onStateChange({ status: 'waiting_approval' })
    
    // Create signer and wait for connection
    const signer = new BunkerSigner(localSecretKey, relay, {
      ...appMetadata
    })
    
    // Set up connection timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Connection timeout - please try again'))
      }, 60000) // 60 second timeout
    })
    
    // Wait for connection
    const connectionPromise = signer.connect()
    
    await Promise.race([connectionPromise, timeoutPromise])
    
    // Test connection
    const remotePubkey = await signer.getPublicKey()
    console.log('[BunkerAuth] ✅ Connected to remote signer:', remotePubkey)
    
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
    console.error('[BunkerAuth] ❌ QR connection failed:', error)
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
    onStateChange({ status: 'connecting', method: 'bunker' })
    
    console.log('[BunkerAuth] 🔗 Connecting to bunker:', bunkerUrl)
    
    // Generate new client keypair
    const { secretKey, pubkey } = generateClientKeypair()
    
    // Create signer from bunker URL
    const signer = await BunkerSigner.fromBunker(secretKey, bunkerUrl)
    
    console.log('[BunkerAuth] 📱 Waiting for approval...')
    onStateChange({ status: 'waiting_approval' })
    
    // Set up connection timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Connection timeout - please try again'))
      }, 60000) // 60 second timeout
    })
    
    // Wait for connection
    const connectionPromise = signer.connect()
    
    await Promise.race([connectionPromise, timeoutPromise])
    
    // Test connection
    const remotePubkey = await signer.getPublicKey()
    console.log('[BunkerAuth] ✅ Connected to remote signer:', remotePubkey)
    
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
    console.error('[BunkerAuth] ❌ Bunker connection failed:', error)
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
    return relay || 'wss://relay.nsecbunker.com'
  } catch {
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
