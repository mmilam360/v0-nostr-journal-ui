import { Nip46RemoteSigner, type Nip46SessionState, type Nip46ClientMetadata } from 'nostr-signer-connector'
import { SimplePool, generateSecretKey, getPublicKey } from 'nostr-tools'

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
 * Monitor for NIP-46 response events to debug handshake issues
 */
export function debugNip46Events(relayUrl: string, clientPubkey: string) {
  console.log("[SignerConnector] 🔍 Starting NIP-46 event debugging...")
  console.log("[SignerConnector] Monitoring relay:", relayUrl)
  console.log("[SignerConnector] Client pubkey:", clientPubkey)
  
  const pool = new SimplePool()
  
  // Listen for all events to see what's happening
  const sub = pool.sub([relayUrl], [
    {
      kinds: [24133], // NIP-46 response events
      "#p": [clientPubkey]
    }
  ])
  
  sub.on('event', (event) => {
    console.log("[SignerConnector] 📨 Received event:", event)
    console.log("[SignerConnector] Event kind:", event.kind)
    console.log("[SignerConnector] Event content:", event.content)
    console.log("[SignerConnector] Event tags:", event.tags)
    console.log("[SignerConnector] Event pubkey:", event.pubkey)
  })
  
  sub.on('eose', () => {
    console.log("[SignerConnector] 📡 End of stored events")
  })
  
  // Clean up after 2 minutes
  setTimeout(() => {
    console.log("[SignerConnector] 🧹 Cleaning up NIP-46 debugging")
    sub.unsub()
    pool.close([relayUrl])
  }, 120000)
  
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
 * Generates nostrconnect:// URI for QR code scanning per NIP-46 spec
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
    // Generate client keypair per NIP-46 spec
    const clientPrivateKey = generateSecretKey()
    const clientPublicKey = getPublicKey(clientPrivateKey)
    
    // Generate secret per NIP-46 spec (required for connection spoofing protection)
    const secret = Math.random().toString(36).substring(2, 10) // 8 character random string
    
    console.log("[SignerConnector] Generated client pubkey:", clientPublicKey)
    console.log("[SignerConnector] Generated secret:", secret)
    
    // Use primary relay per NIP-46 best practices
    const primaryRelay = relayUrls[0]
    
    // Build nostrconnect:// URI per NIP-46 specification
    const params = new URLSearchParams()
    params.set('relay', primaryRelay)
    params.set('secret', secret)
    
    // Add permissions per NIP-46 spec
    const permissions = [
      'sign_event',
      'get_public_key',
      'delete_event',
      'nip04_encrypt',
      'nip04_decrypt',
      'get_relays'
    ]
    params.set('perms', permissions.join(','))
    
    // Add metadata
    if (clientMetadata.name) params.set('name', clientMetadata.name)
    if (clientMetadata.description) params.set('description', clientMetadata.description)
    
    const connectUri = `nostrconnect://${clientPublicKey}?${params.toString()}`
    
    console.log("[SignerConnector] Generated NIP-46 compliant URI:", connectUri)
    console.log("[SignerConnector] URI analysis:")
    console.log("[SignerConnector] - Has secret parameter:", connectUri.includes('secret='))
    console.log("[SignerConnector] - Has perms parameter:", connectUri.includes('perms='))
    console.log("[SignerConnector] - Primary relay:", primaryRelay)
    
    // Create a promise that resolves when we receive the connect response
    const establishedPromise = new Promise<{ signer: Nip46RemoteSigner; session: Nip46SessionState }>((resolve, reject) => {
      const pool = new SimplePool()
      let timeoutId: NodeJS.Timeout
      
      // Set up timeout
      timeoutId = setTimeout(() => {
        console.log("[SignerConnector] ⏰ Connection timeout after 2 minutes")
        sub.unsub()
        pool.close([primaryRelay])
        reject(new Error('Connection timeout - remote signer did not respond'))
      }, 120000)
      
      // Listen for connect response events (kind 24133)
      const sub = pool.sub([primaryRelay], [
        {
          kinds: [24133],
          "#p": [clientPublicKey]
        }
      ])
      
      sub.on('event', (event) => {
        console.log("[SignerConnector] 📨 Received event:", event)
        console.log("[SignerConnector] Event kind:", event.kind)
        console.log("[SignerConnector] Event pubkey:", event.pubkey)
        console.log("[SignerConnector] Event content:", event.content)
        
        // This is a connect response from the remote signer
        // For now, we'll use the library to handle the rest
        clearTimeout(timeoutId)
        sub.unsub()
        pool.close([primaryRelay])
        
        // Create signer instance with the received remote signer pubkey
        const remoteSignerPubkey = event.pubkey
        console.log("[SignerConnector] ✅ Received connect response from:", remoteSignerPubkey)
        
        // Create a mock session for now
        const session: Nip46SessionState = {
          sessionKey: clientPrivateKey,
          remotePubkey: remoteSignerPubkey,
          relayUrls: [primaryRelay]
        }
        
        // Create signer instance (we'll need to implement this properly)
        const signer = new Nip46RemoteSigner(connectUri)
        
        resolve({ signer, session })
      })
      
      sub.on('eose', () => {
        console.log("[SignerConnector] 📡 End of stored events")
      })
    })
    
    return {
      connectUri,
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