/**
 * Signer Manager - Maintains persistent remote signer connection
 * This prevents requiring user approval for every single operation
 */

import type { AuthData } from "@/components/main-app"

let remoteSigner: any = null
let signerPool: any = null
let currentAuthData: AuthData | null = null

/**
 * Initialize or get the persistent remote signer
 */
export async function getRemoteSigner(authData: AuthData) {
  // If we already have a signer for this user, return it
  if (remoteSigner && currentAuthData?.pubkey === authData.pubkey) {
    console.log("[SignerManager] ✅ Using existing signer connection")
    return remoteSigner
  }

  // Clean up old signer if user changed
  if (remoteSigner) {
    console.log("[SignerManager] 🔄 User changed, cleaning up old signer")
    await cleanupSigner()
  }

  console.log("[SignerManager] 🔌 Initializing new remote signer connection...")

  const { SimplePool } = await import("nostr-tools/pool")
  const { BunkerSigner } = await import("nostr-tools/nip46")

  // Create persistent pool
  signerPool = new SimplePool()

  try {
    // Create signer from stored URI - this automatically connects
    remoteSigner = await BunkerSigner.fromURI(
      authData.clientSecretKey!,
      authData.bunkerUri!,
      {
        pool: signerPool,
        timeout: 60000,
      }
    )

    currentAuthData = authData
    console.log("[SignerManager] ✅ Remote signer connected and ready")

    return remoteSigner
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to initialize signer:", error)
    await cleanupSigner()
    throw new Error(`Failed to connect to remote signer: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Sign an event using the remote signer
 */
export async function signEventWithRemote(unsignedEvent: any, authData: AuthData) {
  console.log("[SignerManager] 📝 Signing event...")
  
  try {
    const signer = await getRemoteSigner(authData)
    const signedEvent = await signer.signEvent(unsignedEvent)
    console.log("[SignerManager] ✅ Event signed successfully")
    return signedEvent
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to sign event:", error)
    throw error
  }
}

/**
 * Encrypt data using remote signer's nip04_encrypt
 */
export async function encryptWithRemote(plaintext: string, recipientPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔐 Encrypting data with remote signer...")
  
  try {
    const signer = await getRemoteSigner(authData)
    
    // Use the signer's nip04 encryption method
    // This calls the remote signer's nip04_encrypt which uses the user's actual private key
    const encrypted = await signer.nip04.encrypt(recipientPubkey, plaintext)
    
    console.log("[SignerManager] ✅ Data encrypted successfully")
    return encrypted
  } catch (error) {
    console.error("[SignerManager] ❌ Failed to encrypt:", error)
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Decrypt data using remote signer's nip04_decrypt
 */
export async function decryptWithRemote(ciphertext: string, senderPubkey: string, authData: AuthData): Promise<string> {
  console.log("[SignerManager] 🔓 Decrypting data with remote signer...")
  
  try {
    const signer = await getRemoteSigner(authData)
    
    // Use the signer's nip04 decryption method
    const decrypted = await signer.nip04.decrypt(senderPubkey, ciphertext)
    
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
  console.log("[SignerManager] 🧹 Cleaning up signer connection...")
  
  if (remoteSigner) {
    try {
      await remoteSigner.close()
    } catch (e) {
      console.warn("[SignerManager] ⚠️ Error closing signer:", e)
    }
    remoteSigner = null
  }

  if (signerPool && currentAuthData?.relays) {
    try {
      signerPool.close(currentAuthData.relays)
    } catch (e) {
      console.warn("[SignerManager] ⚠️ Error closing pool:", e)
    }
    signerPool = null
  }

  currentAuthData = null
}

/**
 * Check if signer is ready
 */
export function isSignerReady(): boolean {
  return remoteSigner !== null && currentAuthData !== null
}
