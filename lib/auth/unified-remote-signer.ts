/**
 * YakiHonne-Style Remote Signer Implementation
 * Complete rewrite following NIP-46/NIP-47 standards
 * 
 * This implementation follows the exact patterns used by YakiHonne
 * for reliable remote signer connections.
 */

import { BunkerSigner } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey, getPublicKey as getPublicKeyFromSecret } from 'nostr-tools/pure'

// Session storage key
const SESSION_STORAGE_KEY = 'nostr_remote_session'

// Default permissions for all connections
const DEFAULT_PERMISSIONS = [
  'sign_event:1',      // Public posts
  'sign_event:5',      // Deletion events
  'sign_event:30001',  // Journal entries
  'sign_event:30078',  // Lightning Goals
  'get_public_key',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  'get_relays'
]

// Relays for connection
const RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://nos.lol'
]

// Session data structure
interface SessionData {
  sessionKey: string
  remotePubkey: string
  relayUrls: string[]
  nostrConnectUri?: string
}

// Connection state
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

class YakiHonneStyleRemoteSigner {
  private activeSigner: BunkerSigner | null = null
  private relayConnections: SimplePool | null = null
  private connectionState: ConnectionState = 'disconnected'
  private stateChangeCallbacks: ((state: { status: ConnectionState; error?: string }) => void)[] = []
  private currentSecretKey: Uint8Array | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private activeSubscription: any = null

  constructor() {
    console.log('[YakiHonneRemoteSigner] 🚀 Initialized (Complete Rewrite)')
  }

  /**
   * Start Nostr Connect flow - generates proper connection URI
   */
  async startNostrConnectFlow(): Promise<string> {
    console.log('[YakiHonneRemoteSigner] 🚀 Starting Nostr Connect flow...')
    
    try {
      this.setConnectionState('connecting')
      
      // Generate client keypair
      this.currentSecretKey = generateSecretKey()
      const clientPubkey = getPublicKeyFromSecret(this.currentSecretKey)
      
      // Generate random secret for connection (32 bytes hex-encoded)
      const secret = this.generateHexSecret(32)
      
      // Create proper Bunker URI following NIP-46 standard
      const bunkerUri = this.createProperBunkerURI(clientPubkey, secret)
      
      console.log('[YakiHonneRemoteSigner] ✅ Generated Bunker URI:', bunkerUri)
      
      // Start listening for connection
      await this.listenForRemoteSigner()
      
      // Set connection timeout
      this.setConnectionTimeout()
      
      return bunkerUri
      
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Nostr Connect flow failed:', error)
      this.setConnectionState('error', error.message)
      throw error
    }
  }

  /**
   * Listen for remote signer connection using NIP-46 protocol
   */
  private async listenForRemoteSigner(): Promise<void> {
    console.log('[YakiHonneRemoteSigner] 👂 Listening for remote signer...')
    
    try {
      // Create relay connections
      this.relayConnections = new SimplePool()
      
      if (!this.currentSecretKey) {
        throw new Error('No secret key available')
      }
      
      const localPubkey = getPublicKeyFromSecret(this.currentSecretKey)
      console.log('[YakiHonneRemoteSigner] 📡 Listening on pubkey:', localPubkey)
      
      // Subscribe to NIP-46 events (kind 24133)
      const sub = this.relayConnections.subscribe(
        RELAYS,
        [{ kinds: [24133], authors: [localPubkey] }],
        {
          onevent: async (event) => {
            console.log('[YakiHonneRemoteSigner] 📨 Received NIP-46 event:', event)
            await this.handleNip46Event(event)
          },
          oneose: () => {
            console.log('[YakiHonneRemoteSigner] 📡 Subscription complete')
          }
        }
      )
      
      // Store subscription for cleanup
      this.activeSubscription = sub
      
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Listen failed:', error)
      this.setConnectionState('error', error.message)
      throw error
    }
  }

  /**
   * Handle incoming NIP-46 events
   */
  private async handleNip46Event(event: any): Promise<void> {
    try {
      console.log('[YakiHonneRemoteSigner] 🔍 Processing NIP-46 event:', event.kind)
      
      // Parse the event content
      const content = JSON.parse(event.content)
      
      if (content.method === 'connect') {
        console.log('[YakiHonneRemoteSigner] 🔗 Connection request received')
        await this.handleConnectionRequest(event)
      }
      
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Error handling NIP-46 event:', error)
    }
  }

  /**
   * Handle connection request from remote signer
   */
  private async handleConnectionRequest(event: any): Promise<void> {
    try {
      console.log('[YakiHonneRemoteSigner] 🤝 Handling connection request...')
      
      if (!this.currentSecretKey) {
        throw new Error('No secret key available')
      }
      
      // Extract remote pubkey from event
      const remotePubkey = event.pubkey
      console.log('[YakiHonneRemoteSigner] 🔑 Remote pubkey:', remotePubkey)
      
      // Create BunkerSigner instance
      this.activeSigner = new BunkerSigner(this.currentSecretKey, {
        permissions: DEFAULT_PERMISSIONS
      })
      
      // Connect to remote signer using the pool
      await this.activeSigner.connect(remotePubkey, this.relayConnections!)
      
      console.log('[YakiHonneRemoteSigner] ✅ Connected to remote signer')
      
      // Clear connection timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }
      
      // Save session
      const sessionData: SessionData = {
        sessionKey: this.bytesToHex(this.currentSecretKey),
        remotePubkey,
        relayUrls: RELAYS
      }
      this.saveSession(sessionData)
      
      this.setConnectionState('connected')
      
      // Notify callbacks
      this.stateChangeCallbacks.forEach(callback => {
        callback({ status: 'connected' })
      })
      
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Connection request failed:', error)
      this.setConnectionState('error', error.message)
    }
  }

  /**
   * Set connection timeout
   */
  private setConnectionTimeout(): void {
    this.connectionTimeout = setTimeout(() => {
      if (this.connectionState === 'connecting') {
        console.log('[YakiHonneRemoteSigner] ⏰ Connection timeout')
        this.setConnectionState('error', 'Connection timeout. Please try again.')
        this.cleanup()
      }
    }, 300000) // 5 minutes
  }

  /**
   * Cleanup connections and subscriptions
   */
  private cleanup(): void {
    if (this.activeSubscription) {
      this.activeSubscription.close()
      this.activeSubscription = null
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
  }

  /**
   * Sign an event using the remote signer
   */
  async signEvent(unsignedEvent: any): Promise<any> {
    if (!this.activeSigner) {
      throw new Error('No active remote signer')
    }
    
    try {
      console.log('[YakiHonneRemoteSigner] ✍️ Signing event:', unsignedEvent.kind)
      const signedEvent = await this.activeSigner.signEvent(unsignedEvent)
      console.log('[YakiHonneRemoteSigner] ✅ Event signed successfully')
      return signedEvent
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Signing failed:', error)
      throw error
    }
  }

  /**
   * Get public key from remote signer
   */
  async getPublicKey(): Promise<string> {
    if (!this.activeSigner) {
      throw new Error('No active remote signer')
    }
    
    try {
      const pubkey = await this.activeSigner.getPublicKey()
      console.log('[YakiHonneRemoteSigner] 🔑 Got public key:', pubkey)
      return pubkey
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Get public key failed:', error)
      throw error
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.activeSigner !== null
  }

  /**
   * Resume session from storage
   */
  async resumeSession(): Promise<boolean> {
    try {
      const sessionData = this.loadSession()
      if (!sessionData) {
        console.log('[YakiHonneRemoteSigner] 📭 No session to resume')
        return false
      }
      
      console.log('[YakiHonneRemoteSigner] 🔄 Resuming session...')
      
      // Recreate signer from session data
      const clientSecretKey = this.hexToBytes(sessionData.sessionKey)
      this.currentSecretKey = clientSecretKey
      
      this.activeSigner = new BunkerSigner(clientSecretKey, {
        permissions: DEFAULT_PERMISSIONS
      })
      
      // Try to reconnect
      await this.activeSigner.connect(sessionData.remotePubkey, this.relayConnections || new SimplePool())
      
      this.setConnectionState('connected')
      console.log('[YakiHonneRemoteSigner] ✅ Session resumed successfully')
      return true
      
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Session resume failed:', error)
      this.setConnectionState('disconnected')
      return false
    }
  }

  /**
   * Clear session and disconnect
   */
  async clearSession(): Promise<void> {
    console.log('[YakiHonneRemoteSigner] 🧹 Clearing session...')
    
    this.cleanup()
    
    this.activeSigner = null
    this.relayConnections = null
    this.currentSecretKey = null
    this.setConnectionState('disconnected')
    
    // Clear from storage
    localStorage.removeItem(SESSION_STORAGE_KEY)
    
    console.log('[YakiHonneRemoteSigner] ✅ Session cleared')
  }

  /**
   * Listen for state changes
   */
  onStateChange(callback: (state: { status: ConnectionState; error?: string }) => void): void {
    this.stateChangeCallbacks.push(callback)
  }

  /**
   * Remove state change listener
   */
  offStateChange(callback: (state: { status: ConnectionState; error?: string }) => void): void {
    const index = this.stateChangeCallbacks.indexOf(callback)
    if (index > -1) {
      this.stateChangeCallbacks.splice(index, 1)
    }
  }

  // Private helper methods

  private setConnectionState(state: ConnectionState, error?: string): void {
    this.connectionState = state
    console.log(`[YakiHonneRemoteSigner] 📊 State: ${state}${error ? ` (${error})` : ''}`)
    
    this.stateChangeCallbacks.forEach(callback => {
      callback({ status: state, error })
    })
  }

  /**
   * Create proper Bunker URI following NIP-46 standard
   * Format: bunker://[client-pubkey]?relay=[relays]&secret=[secret]
   */
  private createProperBunkerURI(clientPubkey: string, secret: string): string {
    const params = new URLSearchParams()
    
    // Add each relay as a separate parameter
    RELAYS.forEach(relay => {
      params.append('relay', relay)
    })
    
    // Add secret parameter
    params.append('secret', secret)
    
    return `bunker://${clientPubkey}?${params.toString()}`
  }

  /**
   * Generate hex-encoded secret (32 bytes)
   */
  private generateHexSecret(length: number): string {
    const randomValues = new Uint8Array(length)
    crypto.getRandomValues(randomValues)
    return Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private saveSession(data: SessionData): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
      console.log('[YakiHonneRemoteSigner] 💾 Session saved')
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Failed to save session:', error)
    }
  }

  private loadSession(): SessionData | null {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!saved) return null
      return JSON.parse(saved)
    } catch (error) {
      console.error('[YakiHonneRemoteSigner] ❌ Failed to load session:', error)
      return null
    }
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    return new Uint8Array(bytes)
  }
}

// Export singleton instance
export const remoteSigner = new YakiHonneStyleRemoteSigner()

// Export individual functions for compatibility
export const startNostrConnectFlow = () => remoteSigner.startNostrConnectFlow()
export const signEvent = (event: any) => remoteSigner.signEvent(event)
export const getPublicKey = () => remoteSigner.getPublicKey()
export const isConnected = () => remoteSigner.isConnected()
export const resumeSession = () => remoteSigner.resumeSession()
export const clearSession = () => remoteSigner.clearSession()
export const disconnect = () => remoteSigner.clearSession()

// Legacy export for backward compatibility
export const startBunkerUrlFlow = () => remoteSigner.startNostrConnectFlow()