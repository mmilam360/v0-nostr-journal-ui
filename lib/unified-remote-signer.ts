/**
 * Unified Remote Signer System (NIP-46 ONLY)
 * Handles ALL remote signer operations in one place
 * - Connection (client-initiated QR + signer-initiated bunker://)
 * - Session persistence and reconstruction
 * - Signing, encryption, decryption
 * 
 * DOES NOT AFFECT:
 * - Browser extension (window.nostr) 
 * - Direct nsec pasting
 * - New account generation
 * 
 * Zero state conflicts, works every time
 */

import { BunkerSigner } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'

// Session storage key
const SESSION_STORAGE_KEY = 'nostr_remote_session'

// Default permissions for all connections
const DEFAULT_PERMISSIONS = [
  'sign_event:1',      // Public posts
  'sign_event:30001',  // Journal entries
  'sign_event:30078',  // Lightning Goals
  'sign_event:5',      // Deletion events
  'get_public_key',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  'get_relays'
]

// Session data structure
interface SessionData {
  sessionKey: string      // Hex string of client secret key
  remotePubkey: string    // Remote signer's pubkey
  relayUrls: string[]     // Relay URLs for NIP-46 communication
  bunkerUri?: string      // Optional: for signer-initiated reconnection
}

// In-memory signer instance (reconstructed on app load)
let activeSigner: BunkerSigner | null = null

/**
 * CLIENT-INITIATED FLOW: Generate QR code for remote signer to scan
 */
export async function startClientInitiatedConnection(
  relayUrls: string[],
  appMetadata: { name: string; description?: string }
): Promise<{
  connectUri: string
  established: Promise<{ userPubkey: string }>
}> {
  console.log('[UnifiedRemoteSigner] 🚀 Starting client-initiated flow...')
  
  try {
    // Generate client keypair
    const clientSecretKey = generateSecretKey()
    const clientPubkey = getPublicKey(clientSecretKey)
    
    // Use nsec.app relay as primary
    const primaryRelay = relayUrls.find(url => url.includes('nsec.app')) || relayUrls[0]
    
    // Generate random secret
    const secret = generateRandomString(16)
    
    // Create connect URI using nostr-tools v2 API
    const { createNostrConnectURI } = await import('nostr-tools/nip46')
    const connectUri = createNostrConnectURI({
      clientPubkey,
      secret,
      relays: [primaryRelay],
      name: appMetadata.name,
      description: appMetadata.description,
      permissions: DEFAULT_PERMISSIONS
    })
    
    console.log('[UnifiedRemoteSigner] ✅ Generated connect URI')
    
    // Start connection establishment (returns immediately)
    const established = (async () => {
      console.log('[UnifiedRemoteSigner] ⏳ Waiting for remote signer to connect...')
      
      const pool = new SimplePool()
      const signer = await BunkerSigner.fromURI(clientSecretKey, connectUri, {
        pool,
        permissions: DEFAULT_PERMISSIONS,
        timeout: 120000 // 2 minutes
      })
      
      console.log('[UnifiedRemoteSigner] ✅ Connection established!')
      
      // Get and verify pubkey
      const userPubkey = await signer.getPublicKey()
      console.log('[UnifiedRemoteSigner] 🔑 User pubkey:', userPubkey)
      
      // Store in memory
      activeSigner = signer
      
      // Save session for future reconnection
      const sessionData: SessionData = {
        sessionKey: bytesToHex(clientSecretKey),
        remotePubkey: userPubkey,
        relayUrls: [primaryRelay]
      }
      saveSession(sessionData)
      
      return { userPubkey }
    })()
    
    return { connectUri, established }
    
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Client flow failed:', error)
    throw new Error(`Connection failed: ${error.message}`)
  }
}

/**
 * SIGNER-INITIATED FLOW: Connect using bunker:// URL from remote signer
 */
export async function connectWithBunkerUri(bunkerUri: string): Promise<{ userPubkey: string }> {
  console.log('[UnifiedRemoteSigner] 🚀 Starting signer-initiated flow...')
  
  try {
    // Validate connection state
    const validation = validateConnectionState()
    if (!validation.valid) {
      throw new Error(validation.error)
    }
    
    // Validate URI format
    if (!bunkerUri.startsWith('bunker://')) {
      throw new Error('Invalid bunker URI format. Must start with bunker://')
    }
    
    // Extract relay from bunker URI BEFORE creating signer
    const extractedRelay = extractRelayFromBunkerUri(bunkerUri)
    console.log('[UnifiedRemoteSigner] 📡 Extracted relay from URI:', extractedRelay)
    
    // Generate client keypair
    const clientSecretKey = generateSecretKey()
    
    // Detect if this is likely a mobile device for longer timeout
    const isMobile = typeof window !== 'undefined' && (
      window.innerWidth < 768 || 
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    )
    
    // Use longer timeout for mobile users who need to switch between apps
    const timeoutMs = isMobile ? 120000 : 60000 // 2 minutes for mobile, 1 minute for desktop
    console.log(`[UnifiedRemoteSigner] ⏱️ Using ${timeoutMs/1000}s timeout (${isMobile ? 'mobile' : 'desktop'} detected)`)
    
    // Connect using BunkerSigner.fromBunker with retry logic
    const signer = await connectWithRetry(async () => {
      console.log('[UnifiedRemoteSigner] 🔌 Attempting bunker connection...')
      return await BunkerSigner.fromBunker(clientSecretKey, bunkerUri, {
        permissions: DEFAULT_PERMISSIONS,
        timeout: timeoutMs
      })
    }, 2, 3000) // Reduced retries but longer delay for app switching
    
    console.log('[UnifiedRemoteSigner] ✅ Connected via bunker URI')
    
    // Get user pubkey
    const userPubkey = await signer.getPublicKey()
    console.log('[UnifiedRemoteSigner] 🔑 User pubkey:', userPubkey)
    
    // Store in memory
    activeSigner = signer
    
    // Save session for future reconnection - use extracted relay, not signer.relays
    const sessionData: SessionData = {
      sessionKey: bytesToHex(clientSecretKey),
      remotePubkey: userPubkey,
      relayUrls: [extractedRelay], // Use extracted relay
      bunkerUri // Save for easy reconnection
    }
    saveSession(sessionData)
    
    return { userPubkey }
    
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Bunker connection failed:', error)
    const friendlyError = getUserFriendlyError(error as Error)
    throw new Error(friendlyError)
  }
}

/**
 * RESUME SESSION: Reconstruct signer from saved session data
 * Called on app load to restore remote signer without requiring user action
 */
export async function resumeSession(): Promise<{ userPubkey: string } | null> {
  console.log('[UnifiedRemoteSigner] 🔄 Attempting to resume session...')
  
  try {
    const sessionData = loadSession()
    if (!sessionData) {
      console.log('[UnifiedRemoteSigner] ℹ️ No saved session found')
      return null
    }
    
    console.log('[UnifiedRemoteSigner] 📦 Found saved session')
    
    // Convert session key from hex to Uint8Array
    const clientSecretKey = hexToBytes(sessionData.sessionKey)
    
    // Reconstruct BunkerSigner from session data
    const pool = new SimplePool()
    const signer = new BunkerSigner(
      clientSecretKey,
      sessionData.remotePubkey,
      sessionData.relayUrls,
      pool
    )
    
    // Verify connection by getting pubkey
    const userPubkey = await signer.getPublicKey()
    console.log('[UnifiedRemoteSigner] ✅ Session resumed successfully')
    console.log('[UnifiedRemoteSigner] 🔑 User pubkey:', userPubkey)
    
    // Store in memory
    activeSigner = signer
    
    return { userPubkey }
    
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Session resume failed:', error)
    clearSession()
    return null
  }
}

/**
 * SIGN EVENT: Sign a Nostr event with remote signer
 */
export async function signEvent(unsignedEvent: any): Promise<any> {
  if (!activeSigner) {
    throw new Error('No active remote signer. Please connect first.')
  }
  
  console.log('[UnifiedRemoteSigner] 📝 Signing event kind:', unsignedEvent.kind)
  
  try {
    const signedEvent = await activeSigner.signEvent(unsignedEvent)
    console.log('[UnifiedRemoteSigner] ✅ Event signed, id:', signedEvent.id)
    return signedEvent
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Signing failed:', error)
    throw new Error(`Signing failed: ${error.message}`)
  }
}

/**
 * NIP-04 ENCRYPT: Encrypt data with remote signer
 */
export async function nip04Encrypt(recipientPubkey: string, plaintext: string): Promise<string> {
  if (!activeSigner) {
    throw new Error('No active remote signer. Please connect first.')
  }
  
  console.log('[UnifiedRemoteSigner] 🔐 Encrypting with NIP-04...')
  
  try {
    if (typeof activeSigner.nip04Encrypt !== 'function') {
      throw new Error('Remote signer does not support NIP-04 encryption')
    }
    
    const encrypted = await activeSigner.nip04Encrypt(recipientPubkey, plaintext)
    console.log('[UnifiedRemoteSigner] ✅ Encrypted successfully')
    return encrypted
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Encryption failed:', error)
    throw new Error(`Encryption failed: ${error.message}`)
  }
}

/**
 * NIP-04 DECRYPT: Decrypt data with remote signer
 */
export async function nip04Decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
  if (!activeSigner) {
    throw new Error('No active remote signer. Please connect first.')
  }
  
  console.log('[UnifiedRemoteSigner] 🔓 Decrypting with NIP-04...')
  
  try {
    if (typeof activeSigner.nip04Decrypt !== 'function') {
      throw new Error('Remote signer does not support NIP-04 decryption')
    }
    
    const decrypted = await activeSigner.nip04Decrypt(senderPubkey, ciphertext)
    console.log('[UnifiedRemoteSigner] ✅ Decrypted successfully')
    return decrypted
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Decryption failed:', error)
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

/**
 * CHECK CONNECTION: Is a remote signer currently active?
 */
export function isConnected(): boolean {
  return activeSigner !== null
}

/**
 * GET USER PUBKEY: Get current user's pubkey from active signer
 */
export async function getUserPubkey(): Promise<string | null> {
  if (!activeSigner) {
    return null
  }
  
  try {
    return await activeSigner.getPublicKey()
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Failed to get pubkey:', error)
    return null
  }
}

/**
 * DISCONNECT: Clear active signer and session
 */
export function disconnect(): void {
  console.log('[UnifiedRemoteSigner] 🔌 Disconnecting...')
  activeSigner = null
  clearSession()
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
    console.log('[UnifiedRemoteSigner] 💾 Session saved')
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Failed to save session:', error)
  }
}

function loadSession(): SessionData | null {
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!saved) return null
    return JSON.parse(saved)
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Failed to load session:', error)
    return null
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    console.log('[UnifiedRemoteSigner] 🗑️ Session cleared')
  } catch (error) {
    console.error('[UnifiedRemoteSigner] ❌ Failed to clear session:', error)
  }
}

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues).map(v => chars[v % chars.length]).join('')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  return new Uint8Array(bytes)
}

function extractRelayFromBunkerUri(uri: string): string {
  try {
    const url = new URL(uri)
    return url.searchParams.get('relay') || 'wss://relay.nsec.app'
  } catch {
    return 'wss://relay.nsec.app'
  }
}

// ============================================================
// STABILITY HELPERS
// ============================================================

/**
 * Retry connection attempts with exponential backoff
 */
async function connectWithRetry(
  connectFn: () => Promise<any>,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[UnifiedRemoteSigner] Connection attempt ${attempt}/${maxRetries}`)
      return await connectFn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      console.log(`[UnifiedRemoteSigner] Attempt ${attempt} failed, retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Validate connection state before attempting connection
 */
function validateConnectionState(): { valid: boolean; error?: string } {
  // Check if already connected
  if (activeSigner) {
    return { valid: false, error: 'Already connected to a remote signer' }
  }
  
  // Check browser compatibility
  if (typeof WebSocket === 'undefined') {
    return { valid: false, error: 'WebSocket not supported in this browser' }
  }
  
  return { valid: true }
}

/**
 * Convert technical errors to user-friendly messages
 */
function getUserFriendlyError(error: Error): string {
  const msg = error.message.toLowerCase()
  
  if (msg.includes('relays') && msg.includes('undefined')) {
    return 'Invalid bunker URL format. Please check the URL and try again.'
  }
  
  if (msg.includes('subscription closed')) {
    return 'Connection timeout. Please make sure you approved the connection in your signing app (nsec.app) and return to this tab.'
  }
  
  if (msg.includes('timeout')) {
    return 'Connection timeout. On mobile: 1) Paste bunker URL, 2) Switch to nsec.app, 3) Approve connection, 4) Return here. Please try again.'
  }
  
  if (msg.includes('rejected')) {
    return 'Connection rejected. Please approve the permission request in your signing app (nsec.app).'
  }
  
  if (msg.includes('already connected')) {
    return 'You are already connected to a remote signer. Please disconnect first.'
  }
  
  if (msg.includes('connection timeout')) {
    return 'Connection timeout. Make sure you approved the connection in your signing app and returned to this tab.'
  }
  
  return error.message || 'Connection failed. Please try again.'
}
