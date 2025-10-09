import { Nip46RemoteSigner } from 'nostr-signer-connector'

let activeSigner: Nip46RemoteSigner | null = null

export function getActiveSigner() {
  return activeSigner
}

export function setActiveSigner(signer: Nip46RemoteSigner | null) {
  activeSigner = signer
}

export function clearActiveSigner() {
  activeSigner = null
}

/**
 * Connect to a remote signer using NIP-46 (bunker:// URL)
 */
export async function connectNip46(bunkerUri: string): Promise<{
  success: boolean
  signer?: Nip46RemoteSigner
  error?: string
}> {
  try {
    console.log("[SignerConnector] Connecting to bunker:", bunkerUri.substring(0, 50) + "...")
    
    // Create a new Nip46RemoteSigner instance
    const signer = new Nip46RemoteSigner(bunkerUri)
    
    // Wait for connection to establish (with timeout)
    console.log("[SignerConnector] Waiting for connection...")
    await Promise.race([
      signer.waitConnected(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 30s")), 30000)
      )
    ])
    
    console.log("[SignerConnector] ✅ Bunker connected")
    
    // Test the connection by getting public key
    const pubkey = await signer.getPublicKey()
    console.log("[SignerConnector] ✅ Got pubkey from bunker:", pubkey)
    
    return {
      success: true,
      signer: signer
    }
    
  } catch (error) {
    console.error("[SignerConnector] ❌ Connection failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed"
    }
  }
}

/**
 * Resume a NIP-46 session from stored session data
 */
export async function resumeNip46Session(sessionData: any): Promise<Nip46RemoteSigner | null> {
  try {
    if (!sessionData?.bunkerUri) {
      console.warn("[SignerConnector] No bunker URI in session data")
      return null
    }
    
    console.log("[SignerConnector] Resuming session...")
    
    const result = await connectNip46(sessionData.bunkerUri)
    
    if (result.success && result.signer) {
      setActiveSigner(result.signer)
      return result.signer
    }
    
    return null
    
  } catch (error) {
    console.error("[SignerConnector] Failed to resume session:", error)
    return null
  }
}

/**
 * Sign an event with the active signer
 */
export async function signWithActiveSigner(unsignedEvent: any): Promise<any> {
  if (!activeSigner) {
    throw new Error("No active signer available")
  }
  
  console.log("[SignerConnector] Signing event with remote signer...")
  
  try {
    const signedEvent = await activeSigner.signEvent(unsignedEvent)
    console.log("[SignerConnector] ✅ Event signed")
    return signedEvent
  } catch (error) {
    console.error("[SignerConnector] ❌ Signing failed:", error)
    throw error
  }
}