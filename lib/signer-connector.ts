import { Nip46RemoteSigner, type Nip46SessionState, type Nip46ClientMetadata } from 'nostr-signer-connector'
import { SimplePool } from 'nostr-tools'

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
 * Monitor for NIP-46 response events (kind 24133) to debug handshake issues
 */
export function monitorNip46Events(relayUrls: string[], clientPubkey: string) {
  console.log("[SignerConnector] 🔍 Starting NIP-46 event monitoring...")
  console.log("[SignerConnector] Monitoring relays:", relayUrls)
  console.log("[SignerConnector] Client pubkey:", clientPubkey)
  
  const pool = new SimplePool()
  
  // Listen for kind 24133 events (NIP-46 responses)
  const sub = pool.sub(relayUrls, [
    {
      kinds: [24133],
      "#p": [clientPubkey],
      limit: 10
    }
  ])
  
  sub.on('event', (event) => {
    console.log("[SignerConnector] 📨 Received kind 24133 event:", event)
    console.log("[SignerConnector] Event content:", event.content)
    console.log("[SignerConnector] Event tags:", event.tags)
  })
  
  sub.on('eose', () => {
    console.log("[SignerConnector] 📡 End of stored events for NIP-46 monitoring")
  })
  
  // Clean up after 5 minutes
  setTimeout(() => {
    console.log("[SignerConnector] 🧹 Cleaning up NIP-46 event monitoring")
    sub.unsub()
    pool.close(relayUrls)
  }, 300000)
  
  return sub
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
  
  try {
    // Use the static method - it returns an object with connectUri and established promise
    const result = Nip46RemoteSigner.listenConnectionFromRemote(relayUrls, clientMetadata, {
      connectTimeoutMs: 300000, // 5 minute timeout - increased for better compatibility
      permissions: [
        'sign_event',
        'get_public_key', 
        'delete_event',
        'nip04_encrypt',
        'nip04_decrypt',
        'get_relays'
      ]
    })
    
    console.log("[SignerConnector] Generated connect URI:", result.connectUri)
    console.log("[SignerConnector] URI analysis:")
    console.log("[SignerConnector] - Has secret parameter:", result.connectUri.includes('secret='))
    console.log("[SignerConnector] - Relay count:", relayUrls.length)
    console.log("[SignerConnector] - Client metadata:", JSON.stringify(clientMetadata, null, 2))
    
    // Enhanced debugging for the established promise
    const debugEstablished = result.established.then(
      (connectionResult) => {
        console.log("[SignerConnector] ✅ Connection established successfully!")
        console.log("[SignerConnector] Signer object:", connectionResult.signer)
        console.log("[SignerConnector] Session object:", connectionResult.session)
        console.log("[SignerConnector] Session keys:", Object.keys(connectionResult.session || {}))
        return connectionResult
      },
      (error) => {
        console.error("[SignerConnector] ❌ Connection promise rejected!")
        console.error("[SignerConnector] Error type:", typeof error)
        console.error("[SignerConnector] Error name:", error.name)
        console.error("[SignerConnector] Error message:", error.message)
        console.error("[SignerConnector] Error stack:", error.stack)
        
        // Check if it's a timeout error
        if (error.message && error.message.includes('timeout')) {
          console.error("[SignerConnector] 🕐 This appears to be a timeout error")
          console.error("[SignerConnector] 💡 The remote signer may not be responding properly")
          console.error("[SignerConnector] 💡 Try using the bunker:// URL method instead")
        }
        
        throw error
      }
    )
    
    return {
      connectUri: result.connectUri,
      established: debugEstablished
    }
    
  } catch (error) {
    console.error("[SignerConnector] ❌ Failed to start client-initiated flow:", error)
    throw error
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