/**
 * Signer Manager - Maintains persistent remote signer connection
 * This prevents requiring user approval for every single operation
 */

import type { AuthData } from "@/components/main-app"
import { getActiveSigner, signWithActiveSigner, resumeNip46Session, setActiveSigner } from './signer-connector'

/**
 * Initialize or get the persistent remote signer
 */
export async function getRemoteSigner(authData: AuthData) {
  console.log("[SignerManager] 🔌 Getting remote signer...")
  
  try {
    // Try to get existing active signer first
    let signer = getActiveSigner()
    
    if (!signer && authData.sessionData) {
      // Try to resume from saved session
      console.log("[SignerManager] 🔄 Resuming from saved session...")
      signer = await resumeNip46Session(authData.sessionData)
    }
    
    if (!signer) {
      throw new Error('No active signer available. Please reconnect.')
    }
    
    console.log("[SignerManager] ✅ Remote signer ready")
    return signer
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to get signer:", error)
    throw new Error(`Failed to connect to remote signer: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Sign an event using the remote signer
 */
export async function signEventWithRemote(unsignedEvent: any, authData: AuthData) {
  console.log("[SignerManager] 📝 Signing event with remote signer...")
  
  try {
    // Use the active signer from nostr-signer-connector
    const signedEvent = await signWithActiveSigner(unsignedEvent)
    
    console.log("[SignerManager] ✅ Event signed successfully")
    return signedEvent
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
