/**
 * NIP-46 Connection Listener
 * Handles the low-level NIP-46 protocol communication
 * Used by the unified remote signer for connection management
 */

import { Relay } from 'nostr-tools/relay'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nip04 } from 'nostr-tools'

export class Nip46ConnectionListener {
  private relayConnections: Relay[] = []
  private isListening = false
  private timeoutId: NodeJS.Timeout | null = null

  constructor() {
    console.log('[Nip46ConnectionListener] 🚀 Initialized')
  }

  /**
   * Listen for remote signer connections
   */
  async listenForRemoteSigner(
    localSecretKey: Uint8Array,
    relayUrls: string[],
    onConnection: (remotePubkey: string) => Promise<void>,
    timeoutMs: number = 300000
  ): Promise<void> {
    console.log('[Nip46ConnectionListener] 👂 Starting to listen for remote signer...')
    
    try {
      this.isListening = true
      
      // Connect to relays
      await this.connectToRelays(relayUrls)
      
      if (this.relayConnections.length === 0) {
        throw new Error('Failed to connect to any relays')
      }
      
      const localPubkey = getPublicKey(localSecretKey)
      console.log('[Nip46ConnectionListener] 📡 Listening on pubkey:', localPubkey)
      
      // Subscribe to NIP-46 events
      const sub = this.relayConnections[0].subscribe(
        [{ kinds: [24133], authors: [localPubkey] }],
        {
          onevent: async (event) => {
            console.log('[Nip46ConnectionListener] 📨 Received event:', event)
            await this.handleEvent(event, localSecretKey, onConnection)
          },
          oneose: () => {
            console.log('[Nip46ConnectionListener] 📡 Subscription complete')
          }
        }
      )
      
      // Set timeout
      this.timeoutId = setTimeout(() => {
        if (this.isListening) {
          console.log('[Nip46ConnectionListener] ⏰ Timeout reached')
          this.stopListening()
          throw new Error('Connection timeout')
        }
      }, timeoutMs)
      
      console.log('[Nip46ConnectionListener] ✅ Listening for connections...')
      
    } catch (error) {
      console.error('[Nip46ConnectionListener] ❌ Listen failed:', error)
      this.stopListening()
      throw error
    }
  }

  /**
   * Stop listening for connections
   */
  stopListening(): void {
    console.log('[Nip46ConnectionListener] 🛑 Stopping listener...')
    
    this.isListening = false
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    
    // Close relay connections
    this.relayConnections.forEach(relay => {
      try {
        relay.close()
      } catch (error) {
        console.warn('[Nip46ConnectionListener] ⚠️ Error closing relay:', error)
      }
    })
    
    this.relayConnections = []
    
    console.log('[Nip46ConnectionListener] ✅ Listener stopped')
  }

  /**
   * Connect to specified relays
   */
  private async connectToRelays(relayUrls: string[]): Promise<void> {
    console.log('[Nip46ConnectionListener] 🔌 Connecting to relays...')
    
    const connectionPromises = relayUrls.map(async (url) => {
      try {
        const relay = await Relay.connect(url)
        this.relayConnections.push(relay)
        console.log(`[Nip46ConnectionListener] ✅ Connected to ${url}`)
      } catch (error) {
        console.warn(`[Nip46ConnectionListener] ⚠️ Failed to connect to ${url}:`, error)
      }
    })
    
    await Promise.allSettled(connectionPromises)
    
    console.log(`[Nip46ConnectionListener] 📊 Connected to ${this.relayConnections.length}/${relayUrls.length} relays`)
  }

  /**
   * Handle incoming NIP-46 events
   */
  private async handleEvent(
    event: any,
    localSecretKey: Uint8Array,
    onConnection: (remotePubkey: string) => Promise<void>
  ): Promise<void> {
    try {
      console.log('[Nip46ConnectionListener] 🔍 Processing event:', event.kind)
      
      if (event.kind !== 24133) {
        console.log('[Nip46ConnectionListener] ⚠️ Ignoring non-NIP-46 event')
        return
      }
      
      // Parse event content
      const content = JSON.parse(event.content)
      console.log('[Nip46ConnectionListener] 📄 Event content:', content)
      
      if (content.method === 'connect') {
        console.log('[Nip46ConnectionListener] 🤝 Connection request received')
        await this.handleConnectionRequest(event, localSecretKey, onConnection)
      } else if (content.method === 'get_public_key') {
        console.log('[Nip46ConnectionListener] 🔑 Public key request received')
        await this.handlePublicKeyRequest(event, localSecretKey)
      } else {
        console.log('[Nip46ConnectionListener] ❓ Unknown method:', content.method)
      }
      
    } catch (error) {
      console.error('[Nip46ConnectionListener] ❌ Error handling event:', error)
    }
  }

  /**
   * Handle connection request from remote signer
   */
  private async handleConnectionRequest(
    event: any,
    localSecretKey: Uint8Array,
    onConnection: (remotePubkey: string) => Promise<void>
  ): Promise<void> {
    try {
      console.log('[Nip46ConnectionListener] 🤝 Handling connection request...')
      
      const remotePubkey = event.pubkey
      console.log('[Nip46ConnectionListener] 🔑 Remote pubkey:', remotePubkey)
      
      // Send connection response
      await this.sendConnectionResponse(event, localSecretKey)
      
      // Notify the callback
      await onConnection(remotePubkey)
      
      // Stop listening since we're connected
      this.stopListening()
      
    } catch (error) {
      console.error('[Nip46ConnectionListener] ❌ Connection request failed:', error)
    }
  }

  /**
   * Send connection response to remote signer
   */
  private async sendConnectionResponse(event: any, localSecretKey: Uint8Array): Promise<void> {
    try {
      console.log('[Nip46ConnectionListener] 📤 Sending connection response...')
      
      const localPubkey = getPublicKey(localSecretKey)
      const remotePubkey = event.pubkey
      
      // Create response event
      const responseEvent = {
        kind: 24133,
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', remotePubkey],
          ['e', event.id]
        ],
        content: JSON.stringify({
          result: 'connected',
          pubkey: localPubkey
        })
      }
      
      // Sign and publish response
      const { finalizeEvent } = await import('nostr-tools')
      const signedEvent = finalizeEvent(responseEvent, localSecretKey)
      
      // Publish to relays
      const publishPromises = this.relayConnections.map(async (relay) => {
        try {
          await relay.publish(signedEvent)
          console.log(`[Nip46ConnectionListener] ✅ Response published to ${relay.url}`)
        } catch (error) {
          console.warn(`[Nip46ConnectionListener] ⚠️ Failed to publish to ${relay.url}:`, error)
        }
      })
      
      await Promise.allSettled(publishPromises)
      
      console.log('[Nip46ConnectionListener] ✅ Connection response sent')
      
    } catch (error) {
      console.error('[Nip46ConnectionListener] ❌ Failed to send connection response:', error)
    }
  }

  /**
   * Handle public key request
   */
  private async handlePublicKeyRequest(event: any, localSecretKey: Uint8Array): Promise<void> {
    try {
      console.log('[Nip46ConnectionListener] 🔑 Handling public key request...')
      
      const localPubkey = getPublicKey(localSecretKey)
      const remotePubkey = event.pubkey
      
      // Create response event
      const responseEvent = {
        kind: 24133,
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', remotePubkey],
          ['e', event.id]
        ],
        content: JSON.stringify({
          result: localPubkey
        })
      }
      
      // Sign and publish response
      const { finalizeEvent } = await import('nostr-tools')
      const signedEvent = finalizeEvent(responseEvent, localSecretKey)
      
      // Publish to relays
      const publishPromises = this.relayConnections.map(async (relay) => {
        try {
          await relay.publish(signedEvent)
          console.log(`[Nip46ConnectionListener] ✅ Public key response published to ${relay.url}`)
        } catch (error) {
          console.warn(`[Nip46ConnectionListener] ⚠️ Failed to publish to ${relay.url}:`, error)
        }
      })
      
      await Promise.allSettled(publishPromises)
      
      console.log('[Nip46ConnectionListener] ✅ Public key response sent')
      
    } catch (error) {
      console.error('[Nip46ConnectionListener] ❌ Failed to send public key response:', error)
    }
  }
}
