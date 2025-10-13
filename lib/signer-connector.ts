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
  console.log("[SignerConnector] 🔧 Setting active signer:", !!signer)
  if (signer) {
    console.log("[SignerConnector] ✅ Active signer set successfully")
  } else {
    console.log("[SignerConnector] ❌ Active signer set to null")
  }
  activeSigner = signer
}

export function clearActiveSigner() {
  console.log("[SignerConnector] 🧹 Clearing active signer...")
  console.trace("[SignerConnector] Clear call stack:")
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
    
    const permissions = [
      'sign_event:1',     // Permission for Kind 1 public posts (publish to Nostr)
      'sign_event:30001', // Specific permission for Kind 30001 journal entries
      'sign_event:5',     // Permission for Kind 5 deletion events
      'get_public_key',
      'delete_event',
      'nip04_encrypt',
      'nip04_decrypt',
      'get_relays',
      'nip44_encrypt',
      'nip44_decrypt'
    ]
    
    console.log("[SignerConnector] Bunker connection requesting permissions:", permissions)
    
    const connectionPromise = Nip46RemoteSigner.connectToRemote(bunkerUri, {
      connectTimeoutMs: timeoutMs,
      permissions: permissions
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
    
    const permissions = [
      'sign_event:1',     // Permission for Kind 1 public posts (publish to Nostr)
      'sign_event:30001', // Specific permission for Kind 30001 journal entries
      'sign_event:5',     // Permission for Kind 5 deletion events
      'get_public_key',
      'delete_event',
      'nip04_encrypt',
      'nip04_decrypt',
      'get_relays',
      'nip44_encrypt',
      'nip44_decrypt'
    ]
    
    console.log("[SignerConnector] Requesting permissions:", permissions)
    
    const result = Nip46RemoteSigner.listenConnectionFromRemote([primaryRelay], clientMetadata, {
      connectTimeoutMs: timeoutMs,
      permissions: permissions
    })
    
    console.log("[SignerConnector] Generated connect URI:", result.connectUri)
    console.log("[SignerConnector] URI analysis:")
    console.log("[SignerConnector] - Has secret parameter:", result.connectUri.includes('secret='))
    console.log("[SignerConnector] - Has perms parameter:", result.connectUri.includes('perms='))
    console.log("[SignerConnector] - Primary relay:", primaryRelay)
    
    // Debug the actual URI parameters
    try {
      const url = new URL(result.connectUri)
      console.log("[SignerConnector] URI parameters:")
      console.log("[SignerConnector] - perms:", url.searchParams.get('perms'))
      console.log("[SignerConnector] - relay:", url.searchParams.get('relay'))
      console.log("[SignerConnector] - metadata:", url.searchParams.get('metadata'))
    } catch (error) {
      console.log("[SignerConnector] Could not parse URI:", error)
    }
    
    // CORRECT THE URI ACCORDING TO NIP-46 SPECIFICATION
    // The library puts permissions in metadata, but NIP-46 requires them as separate 'perms' parameter
    let correctedUri = result.connectUri
    
    try {
      const url = new URL(result.connectUri)
      // Extract client pubkey from the URI path (everything between :// and ?)
      const clientPubkey = url.pathname || result.connectUri.split('://')[1].split('?')[0]
      
      console.log("[SignerConnector] Debug URI parsing:")
      console.log("[SignerConnector] - Original URI:", result.connectUri)
      console.log("[SignerConnector] - URL pathname:", url.pathname)
      console.log("[SignerConnector] - Extracted client pubkey:", clientPubkey)
      
      // Extract secret from original URI
      const secret = url.searchParams.get('secret')
      const relay = url.searchParams.get('relay')
      
      // Parse metadata to get permissions
      const metadata = url.searchParams.get('metadata')
      let permsString = ''
      if (metadata) {
        try {
          const metadataObj = JSON.parse(decodeURIComponent(metadata))
          if (metadataObj.perms) {
            permsString = metadataObj.perms
          }
        } catch (e) {
          console.log("[SignerConnector] Could not parse metadata:", e)
        }
      }
      
      // Construct correct URI according to NIP-46 spec
      const params = new URLSearchParams()
      if (relay) params.set('relay', relay)
      if (secret) params.set('secret', secret)
      if (permsString) params.set('perms', permsString)
      if (clientMetadata.name) params.set('name', clientMetadata.name)
      if (clientMetadata.description) params.set('description', clientMetadata.description)
      
      correctedUri = `nostrconnect://${clientPubkey}?${params.toString()}`
      console.log("[SignerConnector] ✅ Corrected URI according to NIP-46 spec:", correctedUri)
      
    } catch (error) {
      console.log("[SignerConnector] Could not correct URI:", error)
    }
    
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
      connectUri: correctedUri,
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
    console.log("[SignerConnector] Resuming session with data:", sessionData)
    
    if (!sessionData?.bunkerUri) {
      console.warn("[SignerConnector] No bunker URI in session data")
      return null
    }

    console.log("[SignerConnector] Resuming session with bunker URI:", sessionData.bunkerUri)

    const result = await connectNip46(sessionData.bunkerUri)
    console.log("[SignerConnector] Connect result:", { success: result.success, hasSigner: !!result.signer })

    if (result.success && result.signer) {
      setActiveSigner(result.signer)
      console.log("[SignerConnector] ✅ Session resumed successfully")
      return result.signer
    }

    console.log("[SignerConnector] ❌ Session resume failed")
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
 * Encrypt data using remote signer's nip04_encrypt
 */
export async function nip04EncryptWithRemote(pubkey: string, plaintext: string): Promise<string> {
  if (!activeSigner) {
    throw new Error("No active signer available")
  }
  
  console.log("[SignerConnector] 🔐 Encrypting with nip04...")
  
  try {
    // Check if the signer has nip04Encrypt method
    if (typeof activeSigner.nip04Encrypt === 'function') {
      const encrypted = await activeSigner.nip04Encrypt(pubkey, plaintext)
      console.log("[SignerConnector] ✅ Encrypted successfully")
      return encrypted
    } else {
      throw new Error("Remote signer does not support nip04_encrypt")
    }
  } catch (error) {
    console.error("[SignerConnector] ❌ Encryption failed:", error)
    throw error
  }
}

/**
 * Decrypt data using remote signer's nip04_decrypt
 */
export async function nip04DecryptWithRemote(pubkey: string, ciphertext: string): Promise<string> {
  if (!activeSigner) {
    throw new Error("No active signer available")
  }
  
  console.log("[SignerConnector] 🔓 Decrypting with nip04...")
  
  try {
    // Check if the signer has nip04Decrypt method
    if (typeof activeSigner.nip04Decrypt === 'function') {
      const decrypted = await activeSigner.nip04Decrypt(pubkey, ciphertext)
      console.log("[SignerConnector] ✅ Decrypted successfully")
      return decrypted
    } else {
      throw new Error("Remote signer does not support nip04_decrypt")
    }
  } catch (error) {
    console.error("[SignerConnector] ❌ Decryption failed:", error)
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