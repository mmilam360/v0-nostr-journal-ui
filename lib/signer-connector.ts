/**
 * Signer Connector - Handles NIP-46 remote signer connections
 * Based on latest nostr-signer-connector documentation and best practices
 */

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
    console.log("[SignerConnector] Bunker URI:", bunkerUri)
    
    // Use the static method with proper timeout handling
    // Mobile connections may need longer timeout
    const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const timeoutMs = isMobile ? 60000 : 30000 // 60 seconds for mobile, 30 for desktop
    
    const connectionPromise = Nip46RemoteSigner.connectToRemote(bunkerUri, {
      connectTimeoutMs: timeoutMs
    })
    
    // Add our own timeout wrapper for better error handling
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeoutMs / 1000} seconds`))
      }, timeoutMs)
    })
    
    const { signer, session } = await Promise.race([connectionPromise, timeoutPromise])
    
    console.log("[SignerConnector] ✅ Connected successfully")
    console.log("[SignerConnector] Signer object:", signer)
    console.log("[SignerConnector] Session object:", session)
    
    // Test the connection by getting public key
    const pubkey = await signer.getPublicKey()
    console.log("[SignerConnector] ✅ Got user pubkey:", pubkey)
    
    // Create proper session data if not provided
    const sessionData: Nip46SessionState = session || {
      sessionKey: signer.clientSecretKey,
      remotePubkey: signer.remotePubkey,
      relayUrls: [extractRelayFromUri(bunkerUri)]
    }
    
    console.log("[SignerConnector] Session data:", sessionData)
    
    return {
      success: true,
      signer: signer,
      session: sessionData
    }
    
  } catch (error) {
    console.error("[SignerConnector] ❌ Connection failed:", error)
    
    let errorMessage = "Connection failed"
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Make sure your signing app is online and try again.'
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Connection rejected by signing app. Please try again.'
      } else if (error.message.includes('Invalid URL')) {
        errorMessage = 'Invalid bunker URL format. Please check your URL and try again.'
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
 * Uses the library's built-in method with proper configuration
 */
export function startClientInitiatedFlow(
  relayUrls: string[],
  clientMetadata: Nip46ClientMetadata
): {
  connectUri: string
  established: Promise<{ signer: Nip46RemoteSigner; session: Nip46SessionState }>
} {
  console.log("[SignerConnector] Starting NIP-46 client-initiated flow...")
  console.log("[SignerConnector] Relays:", relayUrls)
  console.log("[SignerConnector] Client metadata:", clientMetadata)
  
  try {
    // Use nsec.app relay as primary for better compatibility
    const primaryRelay = relayUrls.find(url => url.includes('nsec.app')) || relayUrls[0]
    console.log("[SignerConnector] Using primary relay:", primaryRelay)
    
    // Use the library's built-in method with proper configuration
    // Mobile connections may need longer timeout
    const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const timeoutMs = isMobile ? 180000 : 120000 // 3 minutes for mobile, 2 for desktop
    
    const result = Nip46RemoteSigner.listenConnectionFromRemote([primaryRelay], clientMetadata, {
      connectTimeoutMs: timeoutMs,
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
    console.log("[SignerConnector] - Has perms parameter:", result.connectUri.includes('perms='))
    console.log("[SignerConnector] - Primary relay:", primaryRelay)
    
    // Enhanced promise handling with proper timeout and cleanup
    const establishedPromise = result.established.then(
      async (connectionResult) => {
        console.log("[SignerConnector] ✅ Connection established successfully!")
        console.log("[SignerConnector] Signer object:", connectionResult.signer)
        console.log("[SignerConnector] Session object:", connectionResult.session)
        
        // Test the connection by getting public key
        try {
          const pubkey = await connectionResult.signer.getPublicKey()
          console.log("[SignerConnector] ✅ Connection verified - got pubkey:", pubkey)
        } catch (error) {
          console.error("[SignerConnector] ❌ Connection verification failed:", error)
          throw new Error('Connection verification failed')
        }
        
        return connectionResult
      },
      (error) => {
        console.error("[SignerConnector] ❌ Connection promise rejected!")
        console.error("[SignerConnector] Error type:", typeof error)
        console.error("[SignerConnector] Error name:", error.name)
        console.error("[SignerConnector] Error message:", error.message)
        
        // Provide user-friendly error messages
        if (error.message && error.message.includes('timeout')) {
          throw new Error('Connection timeout. Make sure your signing app is open and connected to the internet, then try again.')
        } else if (error.message && error.message.includes('rejected')) {
          throw new Error('Connection rejected by signing app. Please approve the connection in your signing app.')
        } else {
          throw new Error(`Connection failed: ${error.message}`)
        }
      }
    )
    
    return {
      connectUri: result.connectUri,
      established: establishedPromise
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

/**
 * Helper function to extract relay URL from bunker URI
 */
function extractRelayFromUri(uri: string): string {
  try {
    const url = new URL(uri)
    const relay = url.searchParams.get('relay')
    return relay || 'wss://relay.damus.io'
  } catch {
    return 'wss://relay.damus.io'
  }
}