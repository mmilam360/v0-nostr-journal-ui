/**
 * Unified Remote Signer System (NIP-46) - YakiHonne Style Implementation
 * Complete implementation following YakiHonne's proven approach
 * 
 * Features:
 * - Proper nostrconnect:// URL generation using createNostrConnectURI
 * - Session management and persistence
 * - Mobile app-switching resilience
 * - Auto-reconnection
 * - Comprehensive error handling
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

class UnifiedRemoteSigner {
  private activeSigner: BunkerSigner | null = null
  private relayConnections: SimplePool | null = null
  private connectionState: ConnectionState = 'disconnected'
  private stateChangeCallbacks: ((state: { status: ConnectionState; error?: string }) => void)[] = []
  private currentSecretKey: Uint8Array | null = null

  constructor() {
    console.log('[UnifiedRemoteSigner] 🚀 Initialized (YakiHonne Style)')
  }

  /**
   * Start Nostr Connect flow - generates proper nostrconnect:// URL
   */
  async startNostrConnectFlow(): Promise<string> {
    console.log('[UnifiedRemoteSigner] 🚀 Starting Nostr Connect flow (YakiHonne style)...')
    
    try {
      this.setConnectionState('connecting')
      
      // Generate client keypair
      this.currentSecretKey = generateSecretKey()
      const clientPubkey = getPublicKeyFromSecret(this.currentSecretKey)
      
      // Generate random secret for connection
      const secret = this.generateRandomString(32)
      
      // Create proper Nostr Connect URI using the standard format
      const nostrConnectUri = this.createNostrConnectURI(clientPubkey, secret)
      
      console.log('[UnifiedRemoteSigner] ✅ Generated Nostr Connect URI:', nostrConnectUri)
      
      // Start listening for connection
      await this.listenForRemoteSigner()
      
      return nostrConnectUri
      
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Nostr Connect flow failed:', error)
      this.setConnectionState('error', error.message)
      throw error
    }
  }

  /**
   * Listen for remote signer connection using NIP-46 protocol
   */
  private async listenForRemoteSigner(): Promise<void> {
    console.log('[UnifiedRemoteSigner] 👂 Listening for remote signer...')
    
    try {
      // Create relay connections
      this.relayConnections = new SimplePool()
      
      if (!this.currentSecretKey) {
        throw new Error('No secret key available')
      }
      
      const localPubkey = getPublicKeyFromSecret(this.currentSecretKey)
      console.log('[UnifiedRemoteSigner] 📡 Listening on pubkey:', localPubkey)
      
      // Subscribe to NIP-46 events
      const sub = this.relayConnections.subscribe(
        RELAYS,
        [{ kinds: [24133], authors: [localPubkey] }],
        {
          onevent: async (event) => {
            console.log('[UnifiedRemoteSigner] 📨 Received NIP-46 event:', event)
            await this.handleNip46Event(event)
          },
          oneose: () => {
            console.log('[UnifiedRemoteSigner] 📡 Subscription complete')
          }
        }
      )
      
      // Set timeout for connection
      setTimeout(() => {
        if (this.connectionState === 'connecting') {
          console.log('[UnifiedRemoteSigner] ⏰ Connection timeout')
          this.setConnectionState('error', 'Connection timeout. Please try again.')
          sub.close()
        }
      }, 300000) // 5 minutes
      
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Listen failed:', error)
      this.setConnectionState('error', error.message)
      throw error
    }
  }

  /**
   * Handle incoming NIP-46 events
   */
  private async handleNip46Event(event: any): Promise<void> {
    try {
      console.log('[UnifiedRemoteSigner] 🔍 Processing NIP-46 event:', event.kind)
      
      // Parse the event content
      const content = JSON.parse(event.content)
      
      if (content.method === 'connect') {
        console.log('[UnifiedRemoteSigner] 🔗 Connection request received')
        await this.handleConnectionRequest(event)
      }
      
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Error handling NIP-46 event:', error)
    }
  }

  /**
   * Handle connection request from remote signer
   */
  private async handleConnectionRequest(event: any): Promise<void> {
    try {
      console.log('[UnifiedRemoteSigner] 🤝 Handling connection request...')
      
      if (!this.currentSecretKey) {
        throw new Error('No secret key available')
      }
      
      // Extract remote pubkey from event
      const remotePubkey = event.pubkey
      console.log('[UnifiedRemoteSigner] 🔑 Remote pubkey:', remotePubkey)
      
      // Create BunkerSigner instance
      this.activeSigner = new BunkerSigner(this.currentSecretKey, {
        permissions: DEFAULT_PERMISSIONS
      })
      
      // Connect to remote signer using the pool
      await this.activeSigner.connect(remotePubkey, this.relayConnections!)
      
      console.log('[UnifiedRemoteSigner] ✅ Connected to remote signer')
      
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
      console.error('[UnifiedRemoteSigner] ❌ Connection request failed:', error)
      this.setConnectionState('error', error.message)
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
      console.log('[UnifiedRemoteSigner] ✍️ Signing event:', unsignedEvent.kind)
      const signedEvent = await this.activeSigner.signEvent(unsignedEvent)
      console.log('[UnifiedRemoteSigner] ✅ Event signed successfully')
      return signedEvent
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Signing failed:', error)
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
      console.log('[UnifiedRemoteSigner] 🔑 Got public key:', pubkey)
      return pubkey
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Get public key failed:', error)
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
        console.log('[UnifiedRemoteSigner] 📭 No session to resume')
        return false
      }
      
      console.log('[UnifiedRemoteSigner] 🔄 Resuming session...')
      
      // Recreate signer from session data
      const clientSecretKey = this.hexToBytes(sessionData.sessionKey)
      this.currentSecretKey = clientSecretKey
      
      this.activeSigner = new BunkerSigner(clientSecretKey, {
        permissions: DEFAULT_PERMISSIONS
      })
      
      // Try to reconnect
      await this.activeSigner.connect(sessionData.remotePubkey, this.relayConnections || new SimplePool())
      
      this.setConnectionState('connected')
      console.log('[UnifiedRemoteSigner] ✅ Session resumed successfully')
      return true
      
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Session resume failed:', error)
      this.setConnectionState('disconnected')
      return false
    }
  }

  /**
   * Clear session and disconnect
   */
  async clearSession(): Promise<void> {
    console.log('[UnifiedRemoteSigner] 🧹 Clearing session...')
    
    this.activeSigner = null
    this.relayConnections = null
    this.currentSecretKey = null
    this.setConnectionState('disconnected')
    
    // Clear from storage
    localStorage.removeItem(SESSION_STORAGE_KEY)
    
    console.log('[UnifiedRemoteSigner] ✅ Session cleared')
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
    console.log(`[UnifiedRemoteSigner] 📊 State: ${state}${error ? ` (${error})` : ''}`)
    
    this.stateChangeCallbacks.forEach(callback => {
      callback({ status: state, error })
    })
  }

  /**
   * Create proper Nostr Connect URI following the standard format
   */
  private createNostrConnectURI(clientPubkey: string, secret: string): string {
    const params = new URLSearchParams({
      relay: RELAYS.join(','),
      secret: secret,
      pubkey: clientPubkey
    })
    
    return `nostrconnect://${clientPubkey}?${params.toString()}`
  }

  private generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const randomValues = new Uint8Array(length)
    crypto.getRandomValues(randomValues)
    return Array.from(randomValues).map(v => chars[v % chars.length]).join('')
  }

  private saveSession(data: SessionData): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
      console.log('[UnifiedRemoteSigner] 💾 Session saved')
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Failed to save session:', error)
    }
  }

  private loadSession(): SessionData | null {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!saved) return null
      return JSON.parse(saved)
    } catch (error) {
      console.error('[UnifiedRemoteSigner] ❌ Failed to load session:', error)
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
export const remoteSigner = new UnifiedRemoteSigner()

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
