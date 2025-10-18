/**
 * Remote Signer Manager - Handles NIP-46 remote signer permissions and event signing
 * Based on NIP-46 specification and proper permission flow
 */

import { Nip46RemoteSigner, type Nip46SessionState } from 'nostr-signer-connector'

interface RemoteSignerSession {
  signer: Nip46RemoteSigner
  sessionState: Nip46SessionState
  permissions: string[]
  userPubkey: string
  isInitialized: boolean
}

class RemoteSignerManager {
  private session: RemoteSignerSession | null = null

  /**
   * Initialize remote signer from session data
   */
  async initializeFromSessionData(sessionData: Nip46SessionState, userPubkey: string): Promise<boolean> {
    try {
      console.log("[RemoteSignerManager] 🔧 Initializing from session data...")
      console.log("[RemoteSignerManager] User pubkey:", userPubkey)
      console.log("[RemoteSignerManager] Session data structure:", {
        hasSessionKey: !!sessionData.sessionKey,
        hasRemotePubkey: !!sessionData.remotePubkey,
        hasRelayUrls: !!sessionData.relayUrls,
        relayCount: sessionData.relayUrls?.length || 0
      })
      
      // Use existing active signer from SignerConnector instead of creating new one
      console.log("[RemoteSignerManager] 🔧 Getting existing active signer from SignerConnector...")
      const { getActiveSigner } = await import('./signer-connector')
      const existingSigner = getActiveSigner()
      
      if (!existingSigner) {
        console.error("[RemoteSignerManager] ❌ No active signer available from SignerConnector")
        return false
      }
      
      console.log("[RemoteSignerManager] ✅ Found existing active signer")
      
      // Test the connection by getting public key
      console.log("[RemoteSignerManager] 🔧 Testing connection by getting public key...")
      const actualUserPubkey = await existingSigner.getPublicKey()
      console.log("[RemoteSignerManager] Actual user pubkey from signer:", actualUserPubkey)
      
      if (actualUserPubkey !== userPubkey) {
        console.warn("[RemoteSignerManager] ⚠️ Pubkey mismatch - expected:", userPubkey, "got:", actualUserPubkey)
      }
      
      // Store session with existing signer
      this.session = {
        signer: existingSigner,
        sessionState: sessionData,
        permissions: [], // Will be populated when we check permissions
        userPubkey: actualUserPubkey,
        isInitialized: true
      }
      
      console.log("[RemoteSignerManager] ✅ Remote signer initialized successfully")
      console.log("[RemoteSignerManager] Session stored:", {
        hasSession: !!this.session,
        isInitialized: this.session.isInitialized,
        hasSigner: !!this.session.signer,
        userPubkey: this.session.userPubkey
      })
      return true
      
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Failed to initialize from session data:", error)
      console.error("[RemoteSignerManager] Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      return false
    }
  }

  /**
   * Check if remote signer is available and initialized
   */
  isAvailable(): boolean {
    const available = this.session !== null && this.session.isInitialized
    console.log("[RemoteSignerManager] isAvailable check:", {
      available,
      hasSession: this.session !== null,
      isInitialized: this.session?.isInitialized,
      hasSigner: !!this.session?.signer
    })
    return available
  }

  /**
   * Get the user's public key
   */
  async getUserPubkey(): Promise<string | null> {
    if (!this.session) {
      console.error("[RemoteSignerManager] ❌ No active session")
      return null
    }

    try {
      const pubkey = await this.session.signer.getPublicKey()
      console.log("[RemoteSignerManager] Retrieved user pubkey:", pubkey)
      return pubkey
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Failed to get user pubkey:", error)
      return null
    }
  }

  /**
   * Sign an event with proper permission handling and timeout
   * This is where the permission popup should appear on first sign
   */
  async signEvent(unsignedEvent: any): Promise<any> {
    if (!this.session) {
      throw new Error("No remote signer session available")
    }

    console.log("[RemoteSignerManager] 🔐 Signing event with remote signer...")
    console.log("[RemoteSignerManager] Event kind:", unsignedEvent.kind)
    console.log("[RemoteSignerManager] Event content length:", unsignedEvent.content?.length)
    
    try {
      // Request permissions for Lightning Goals events if this is a kind 30078 event
      if (unsignedEvent.kind === 30078) {
        console.log("[RemoteSignerManager] 🔐 Requesting Lightning Goals permissions for kind 30078 event...")
        await this.requestLightningGoalsPermissions()
      }
      
      // Add timeout wrapper to prevent indefinite hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("NIP-46 signing timeout after 30 seconds"))
        }, 30000) // 30 second timeout
      })
      
      // This should trigger the permission request if not already granted
      // The remote signer app should show a permission popup for the first sign_event call
      const signPromise = this.session.signer.signEvent(unsignedEvent)
      
      const signedEvent = await Promise.race([signPromise, timeoutPromise])
      
      console.log("[RemoteSignerManager] ✅ Event signed successfully")
      console.log("[RemoteSignerManager] Signed event ID:", signedEvent.id)
      
      return signedEvent
      
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Failed to sign event:", error)
      
      // Provide more helpful error messages
      if (error.message.includes("timeout")) {
        throw new Error("Remote signer request timed out. Please check your remote signer app and try again.")
      } else if (error.message.includes("permission")) {
        throw new Error("Permission denied by remote signer. Please approve the signing request in your remote signer app.")
      } else if (error.message.includes("NIP-46")) {
        throw new Error("NIP-46 communication error. Please check your remote signer connection and try again.")
      }
      
      throw error
    }
  }

  /**
   * Encrypt data using remote signer's nip04_encrypt
   */
  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    if (!this.session) {
      throw new Error("No remote signer session available")
    }
    
    console.log("[RemoteSignerManager] 🔐 Encrypting with nip04...")
    
    try {
      // Check if the signer has nip04Encrypt method
      if (typeof this.session.signer.nip04Encrypt === 'function') {
        const encrypted = await this.session.signer.nip04Encrypt(pubkey, plaintext)
        console.log("[RemoteSignerManager] ✅ Encrypted successfully")
        return encrypted
      } else {
        throw new Error("Remote signer does not support nip04_encrypt")
      }
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Encryption failed:", error)
      throw error
    }
  }

  /**
   * Decrypt data using remote signer's nip04_decrypt
   */
  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    console.log("[RemoteSignerManager] 🔓 nip04Decrypt called with:", {
      hasSession: this.session !== null,
      isInitialized: this.session?.isInitialized,
      hasSigner: !!this.session?.signer,
      hasNip04Decrypt: typeof this.session?.signer?.nip04Decrypt === 'function'
    })
    
    if (!this.session) {
      throw new Error("No remote signer session available")
    }
    
    console.log("[RemoteSignerManager] 🔓 Decrypting with nip04...")
    
    try {
      // Check if the signer has nip04Decrypt method
      if (typeof this.session.signer.nip04Decrypt === 'function') {
        const decrypted = await this.session.signer.nip04Decrypt(pubkey, ciphertext)
        console.log("[RemoteSignerManager] ✅ Decrypted successfully")
        return decrypted
      } else {
        throw new Error("Remote signer does not support nip04_decrypt")
      }
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Decryption failed:", error)
      throw error
    }
  }

  /**
   * Request specific permissions from remote signer
   */
  async requestPermissions(permissions: string[]): Promise<boolean> {
    if (!this.session) {
      console.error("[RemoteSignerManager] ❌ No active session for permission request")
      return false
    }

    try {
      console.log("[RemoteSignerManager] 🔐 Requesting permissions:", permissions)
      
      // For now, we'll assume permissions are granted during the initial connection
      // The actual permission request should happen when we try to sign the first event
      this.session.permissions = permissions
      
      console.log("[RemoteSignerManager] ✅ Permissions requested")
      return true
      
    } catch (error) {
      console.error("[RemoteSignerManager] ❌ Failed to request permissions:", error)
      return false
    }
  }

  /**
   * Request permissions for Lightning Goals events (kind 30078)
   */
  async requestLightningGoalsPermissions(): Promise<boolean> {
    console.log("[RemoteSignerManager] 🔐 Requesting Lightning Goals permissions...")
    
    // Request permissions for kind 30078 events
    const permissions = [
      "sign_event:30078", // Lightning Goals events
      "nip04_encrypt",    // For encrypting event content if needed
    ]
    
    return await this.requestPermissions(permissions)
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    console.log("[RemoteSignerManager] 🧹 Clearing remote signer session")
    this.session = null
  }

  /**
   * Get current session info for debugging
   */
  getSessionInfo(): any {
    if (!this.session) {
      return { available: false }
    }

    return {
      available: true,
      userPubkey: this.session.userPubkey,
      permissions: this.session.permissions,
      isInitialized: this.session.isInitialized,
      hasSigner: !!this.session.signer
    }
  }
}

// Export singleton instance
export const remoteSignerManager = new RemoteSignerManager()
