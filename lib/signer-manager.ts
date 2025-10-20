/**
 * Signer Manager - Maintains persistent remote signer connection
 * Now powered by NDK for better stability and compatibility
 */

import type { AuthData } from "@/components/main-app"
import {
  getActiveSigner as ndkGetActiveSigner,
  signEventWithRemote as ndkSignEvent,
  encryptWithRemote as ndkEncrypt,
  decryptWithRemote as ndkDecrypt,
  cleanupSigner as ndkCleanup,
  isSignerReady as ndkIsReady,
  initializeSignerFromAuthData
} from './ndk-signer-manager'

// Re-export getActiveSigner for external use
export const getActiveSigner = ndkGetActiveSigner

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
 * Now uses NDK underneath for better stability
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
    // Use NDK-based signing
    const signedEvent = await ndkSignEvent(unsignedEvent, authData)
    console.log("[SignerManager] ✅ Event signed successfully")
    console.log("[SignerManager] 🔑 Signed event ID:", signedEvent.id)
    return signedEvent
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to sign event:", error)
    throw error
  }
}

/**
 * Encrypt data using NIP-04 with remote signer's shared secret
 * Now uses NDK underneath for better stability
 */
export async function encryptWithRemote(plaintext: string, recipientPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔐 Encrypting data with NIP-04...")

  try {
    const encrypted = await ndkEncrypt(plaintext, recipientPubkey, authData)
    console.log("[SignerManager] ✅ Data encrypted successfully")
    return encrypted
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to encrypt:", error)
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Decrypt data using NIP-04 with remote signer's shared secret
 * Now uses NDK underneath for better stability
 */
export async function decryptWithRemote(ciphertext: string, senderPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔓 Decrypting data with NIP-04...")

  try {
    const decrypted = await ndkDecrypt(ciphertext, senderPubkey, authData)
    console.log("[SignerManager] ✅ Data decrypted successfully")
    return decrypted
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to decrypt:", error)
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Clean up signer connection
 * Now uses NDK underneath for better stability
 */
export async function cleanupSigner() {
  console.log("[SignerManager] 🧹 Cleaning up signer...")
  await ndkCleanup()
}

/**
 * Check if signer is ready
 * Now uses NDK underneath for better stability
 */
export function isSignerReady(): boolean {
  return ndkIsReady()
}
