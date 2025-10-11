/**
 * Noauth Signer Manager - Uses noauth-connect widget for event signing
 * Based on the noauth-connect library approach
 */

interface NoauthSignerManager {
  widget: any | null
  isConnected: boolean
  userPubkey: string | null
}

class NoauthSignerManager {
  private static instance: NoauthSignerManager
  private widget: any | null = null
  private isConnected: boolean = false
  private userPubkey: string | null = null

  private constructor() {
    console.log("[NoauthSignerManager] Initializing NoauthSignerManager")
  }

  static getInstance(): NoauthSignerManager {
    if (!NoauthSignerManager.instance) {
      NoauthSignerManager.instance = new NoauthSignerManager()
    }
    return NoauthSignerManager.instance
  }

  /**
   * Set the noauth-connect widget reference
   */
  setWidget(widget: any) {
    console.log("[NoauthSignerManager] Setting widget reference")
    this.widget = widget
  }

  /**
   * Mark as connected with user pubkey
   */
  setConnected(pubkey: string) {
    console.log("[NoauthSignerManager] Marking as connected with pubkey:", pubkey)
    this.isConnected = true
    this.userPubkey = pubkey
  }

  /**
   * Mark as disconnected
   */
  setDisconnected() {
    console.log("[NoauthSignerManager] Marking as disconnected")
    this.isConnected = false
    this.userPubkey = null
  }

  /**
   * Check if signer is available
   */
  isAvailable(): boolean {
    const available = this.widget !== null && this.isConnected
    console.log("[NoauthSignerManager] isAvailable:", available)
    return available
  }

  /**
   * Sign an event using the noauth-connect widget
   */
  async signEvent(unsignedEvent: any): Promise<any> {
    if (!this.widget || !this.isConnected) {
      throw new Error("Noauth signer not available")
    }

    console.log("[NoauthSignerManager] 🔐 Signing event with noauth widget...")
    console.log("[NoauthSignerManager] Event kind:", unsignedEvent.kind)
    
    try {
      // Use the widget's signEvent method directly
      const signedEvent = await this.widget.signEvent(unsignedEvent)
      
      console.log("[NoauthSignerManager] ✅ Event signed successfully")
      console.log("[NoauthSignerManager] Signed event ID:", signedEvent.id)
      
      return signedEvent
    } catch (error) {
      console.error("[NoauthSignerManager] ❌ Failed to sign event:", error)
      throw error
    }
  }

  /**
   * Encrypt data using noauth-connect widget
   */
  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    if (!this.widget || !this.isConnected) {
      throw new Error("Noauth signer not available")
    }
    
    console.log("[NoauthSignerManager] 🔐 Encrypting with nip04...")
    
    try {
      // The noauth-connect widget should handle encryption
      // For now, we'll need to check if it exposes encryption methods
      // This might need to be implemented differently based on the widget's API
      throw new Error("nip04_encrypt not yet implemented with noauth-connect")
    } catch (error) {
      console.error("[NoauthSignerManager] ❌ Encryption failed:", error)
      throw error
    }
  }

  /**
   * Decrypt data using noauth-connect widget
   */
  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    if (!this.widget || !this.isConnected) {
      throw new Error("Noauth signer not available")
    }
    
    console.log("[NoauthSignerManager] 🔓 Decrypting with nip04...")
    
    try {
      // The noauth-connect widget should handle decryption
      // For now, we'll need to check if it exposes decryption methods
      // This might need to be implemented differently based on the widget's API
      throw new Error("nip04_decrypt not yet implemented with noauth-connect")
    } catch (error) {
      console.error("[NoauthSignerManager] ❌ Decryption failed:", error)
      throw error
    }
  }

  /**
   * Get current connection info
   */
  getConnectionInfo(): { connected: boolean; pubkey: string | null } {
    return {
      connected: this.isConnected,
      pubkey: this.userPubkey
    }
  }
}

export const noauthSignerManager = NoauthSignerManager.getInstance()
