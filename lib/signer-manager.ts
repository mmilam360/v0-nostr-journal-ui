/**
 * Signer Manager - Maintains persistent remote signer connection
 * This prevents requiring user approval for every single operation
 */

import type { AuthData } from "@/components/main-app"
import { getActiveSigner, signWithActiveSigner, resumeNip46Session, setActiveSigner, clearActiveSigner } from './signer-connector'

// Declare window.nostr for TypeScript
declare global {
  interface Window {
    nostr?: {
      signEvent: (event: any) => Promise<any>
      getPublicKey: () => Promise<string>
    }
  }
}

// Simplified signer manager - remote signer is now handled by MKStacks implementation

/**
 * Sign an event using the appropriate signer based on auth method
 */
export async function signEventWithRemote(unsignedEvent: any, authData: AuthData) {
  console.log("[SignerManager] 📝 Signing event with auth method:", authData.authMethod)
  console.log("[SignerManager] 📝 Unsigned event structure:", {
    kind: unsignedEvent.kind,
    created_at: unsignedEvent.created_at,
    tags: unsignedEvent.tags,
    content_length: unsignedEvent.content?.length,
    pubkey: unsignedEvent.pubkey,
    has_content: !!unsignedEvent.content
  })
  
  try {
    if (authData.authMethod === "extension") {
      // Use browser extension for signing
      console.log("[SignerManager] Using browser extension for signing")
      const { nip07 } = await import("nostr-tools")
      
      if (!window.nostr) {
        throw new Error("Nostr extension not found")
      }
      
      console.log("[SignerManager] 🔌 Calling window.nostr.signEvent...")
      const signedEvent = await window.nostr.signEvent(unsignedEvent)
      console.log("[SignerManager] ✅ Event signed with extension")
      console.log("[SignerManager] 🔑 Signed event ID:", signedEvent.id)
      return signedEvent
      
    } else if (authData.authMethod === "nsec") {
      // Use private key for signing
      console.log("[SignerManager] Using private key for signing")
      const { finalizeEvent } = await import("nostr-tools")
      
      if (!authData.privateKey) {
        throw new Error("Private key not available")
      }
      
      const pkBytes = new Uint8Array(
        authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || []
      )
      
      const signedEvent = finalizeEvent(unsignedEvent, pkBytes)
      console.log("[SignerManager] ✅ Event signed with private key")
      return signedEvent
      
    } else if (authData.authMethod === "remote") {
      // Use NIP-46 remote signer for signing
      console.log("[SignerManager] Using NIP-46 remote signer for signing")
      
      // Debug: Check if active signer exists
      const activeSigner = getActiveSigner()
      console.log("[SignerManager] Active signer exists:", !!activeSigner)
      if (!activeSigner) {
        console.error("[SignerManager] ❌ No active signer available for remote auth method")
        console.log("[SignerManager] 🔧 Attempting to resume session from localStorage...")
        
        // Try to resume session from localStorage
        try {
          const savedSession = localStorage.getItem('nostr_remote_session')
          if (savedSession) {
            console.log("[SignerManager] 🔧 Found saved session, attempting to resume...")
            const sessionData = JSON.parse(savedSession)
            const { resumeNip46Session } = await import('./signer-connector')
            const signer = await resumeNip46Session(sessionData)
            if (signer) {
              console.log("[SignerManager] ✅ Session resumed successfully")
            } else {
              console.error("[SignerManager] ❌ Failed to resume session")
              throw new Error("No active signer available")
            }
          } else {
            console.error("[SignerManager] ❌ No saved session found")
            throw new Error("No active signer available")
          }
        } catch (error) {
          console.error("[SignerManager] ❌ Session resume failed:", error)
          throw new Error("No active signer available")
        }
      }
      
      const signedEvent = await signWithActiveSigner(unsignedEvent)
      console.log("[SignerManager] ✅ Event signed with NIP-46 remote signer")
      return signedEvent
      
    } else {
      throw new Error(`Unsupported auth method: ${authData.authMethod}`)
    }
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to sign event:", error)
    throw error
  }
}

/**
 * Encrypt data using NIP-04 with remote signer's shared secret
 */
export async function encryptWithRemote(plaintext: string, recipientPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔐 Encrypting data with NIP-04...")
  
  try {
    // Import nip04 the same way as in login-page.tsx
    const { nip04 } = await import("nostr-tools/pure")
    
    console.log("[SignerManager] 🔍 nip04 object:", nip04)
    console.log("[SignerManager] 🔍 nip04 methods:", nip04 ? Object.keys(nip04) : "nip04 is undefined")
    
    if (!nip04) {
      throw new Error("nip04 module is undefined")
    }
    
    if (!nip04.getSharedSecret || !nip04.encrypt) {
      throw new Error(`nip04 methods missing. Available: ${Object.keys(nip04)}`)
    }
    
    // Convert clientSecretKey to Uint8Array if it's a hex string
    let clientSecretKey = authData.clientSecretKey
    if (typeof clientSecretKey === 'string') {
      clientSecretKey = new Uint8Array(
        clientSecretKey.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      )
    }
    
    // Use the client secret key to generate shared secret with recipient
    const sharedSecret = nip04.getSharedSecret(clientSecretKey, recipientPubkey)
    const encrypted = await nip04.encrypt(sharedSecret, plaintext)
    
    console.log("[SignerManager] ✅ Data encrypted successfully")
    return encrypted
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to encrypt:", error)
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Decrypt data using NIP-04 with remote signer's shared secret
 */
export async function decryptWithRemote(ciphertext: string, senderPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔓 Decrypting data with NIP-04...")
  
  try {
    // Import nip04 the same way as in login-page.tsx
    const { nip04 } = await import("nostr-tools/pure")
    
    console.log("[SignerManager] 🔍 nip04 object:", nip04)
    console.log("[SignerManager] 🔍 nip04 methods:", nip04 ? Object.keys(nip04) : "nip04 is undefined")
    
    if (!nip04) {
      throw new Error("nip04 module is undefined")
    }
    
    if (!nip04.getSharedSecret || !nip04.decrypt) {
      throw new Error(`nip04 methods missing. Available: ${Object.keys(nip04)}`)
    }
    
    // Convert clientSecretKey to Uint8Array if it's a hex string
    let clientSecretKey = authData.clientSecretKey
    if (typeof clientSecretKey === 'string') {
      clientSecretKey = new Uint8Array(
        clientSecretKey.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      )
    }
    
    // Use the client secret key to generate shared secret with sender
    const sharedSecret = nip04.getSharedSecret(clientSecretKey, senderPubkey)
    const decrypted = await nip04.decrypt(sharedSecret, ciphertext)
    
    console.log("[SignerManager] ✅ Data decrypted successfully")
    return decrypted
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to decrypt:", error)
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Clean up signer connection
 */
export async function cleanupSigner() {
  console.log("[SignerManager] 🧹 Cleaning up signer...")
  
  // The nostr-signer-connector handles cleanup automatically
  // Just clear from memory
  const { clearActiveSigner } = await import('./signer-connector');
  clearActiveSigner();
}

/**
 * Check if signer is ready
 */
export function isSignerReady(): boolean {
  const signer = getActiveSigner();
  return signer !== null;
}
