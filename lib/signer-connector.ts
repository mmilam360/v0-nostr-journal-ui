import { Nip46RemoteSigner, type Nip46SessionState, type Nip46ClientMetadata } from 'nostr-signer-connector'

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
 * Connect to a remote signer using bunker:// URL (Signer-initiated flow)
 * Used when user pastes bunker:// URL from nsec.app
 */
export async function connectNip46(bunkerUri: string): Promise<{
  success: boolean
  signer?: Nip46RemoteSigner
  session?: Nip46SessionState
  error?: string
}> {
  try {
    console.log("[SignerConnector] Connecting to bunker via signer-initiated flow...")
    
    // Use the static method - it returns a promise that resolves when connected
    const { signer, session } = await Nip46RemoteSigner.connectToRemote(bunkerUri, {
      connectTimeoutMs: 30000 // 30 second timeout
    })
    
    console.log("[SignerConnector] ✅ Connected successfully")
    
    // Test the connection
    const pubkey = await signer.getPublicKey()
    console.log("[SignerConnector] ✅ Got user pubkey:", pubkey)
    
    return {
      success: true,
      signer: signer,
      session: session
    }
    
  } catch (error) {
    console.error("[SignerConnector] ❌ Connection failed:", error)
    
    let errorMessage = "Connection failed"
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Make sure your signing app is online.'
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Connection rejected by signing app.'
      } else {
        errorMessage = error.message
      }
    }
    
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Start listening for remote signer connection (Client-initiated flow)
 * Generates nostrconnect:// URI for QR code scanning
 */
export function startClientInitiatedFlow(
  relayUrls: string[],
  clientMetadata: Nip46ClientMetadata
): {
  connectUri: string
  established: Promise<{ signer: Nip46RemoteSigner; session: Nip46SessionState }>
} {
  console.log("[SignerConnector] Starting client-initiated flow...")
  console.log("[SignerConnector] Relays:", relayUrls)
  console.log("[SignerConnector] Client metadata:", clientMetadata)
  
  // Use the static method - it returns an object with connectUri and established promise
          const result = Nip46RemoteSigner.listenConnectionFromRemote(relayUrls, clientMetadata, {
            connectTimeoutMs: 300000 // 5 minute timeout - increased for better compatibility
          })
  
  console.log("[SignerConnector] Generated connect URI:", result.connectUri)
  console.log("[SignerConnector] URI analysis:")
  console.log("[SignerConnector] - Has secret parameter:", result.connectUri.includes('secret='))
  console.log("[SignerConnector] - Relay count:", relayUrls.length)
  console.log("[SignerConnector] - Client metadata:", JSON.stringify(clientMetadata, null, 2))
  
  // Wrap the established promise with additional debugging
  const debugEstablished = result.established.then(
    (connectionResult) => {
      console.log("[SignerConnector] ✅ Connection established successfully:", connectionResult)
      return connectionResult
    },
    (error) => {
      console.error("[SignerConnector] ❌ Connection failed:", error)
      console.error("[SignerConnector] Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      throw error
    }
  )
  
  return {
    connectUri: result.connectUri,
    established: debugEstablished
  }
}

/**
 * Resume a NIP-46 session from stored session data
 */
export async function resumeNip46Session(sessionData: Nip46SessionState): Promise<Nip46RemoteSigner | null> {
  try {
    if (!sessionData) {
      console.warn("[SignerConnector] No session data provided")
      return null
    }
    
    console.log("[SignerConnector] Resuming session...")
    
    // Use the static resumeSession method
    const signer = await Nip46RemoteSigner.resumeSession(sessionData)
    
    console.log("[SignerConnector] ✅ Session resumed")
    
    // Test the connection
    const pubkey = await signer.getPublicKey()
    console.log("[SignerConnector] ✅ Verified pubkey:", pubkey)
    
    setActiveSigner(signer)
    return signer
    
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
  
  console.log("[SignerConnector] Signing event...")
  
  try {
    const signedEvent = await activeSigner.signEvent(unsignedEvent)
    console.log("[SignerConnector] ✅ Event signed")
    return signedEvent
  } catch (error) {
    console.error("[SignerConnector] ❌ Signing failed:", error)
    throw error
  }
}