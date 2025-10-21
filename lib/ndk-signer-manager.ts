/**
 * NDK-based Signer Manager
 * Provides the same interface as the old signer-manager but uses NDK underneath
 */

import NDK, { NDKNip46Signer, NDKPrivateKeySigner, NDKEvent, type NDKSigner, type NostrEvent } from '@nostr-dev-kit/ndk'

interface AuthData {
  pubkey: string
  authMethod: 'extension' | 'nsec' | 'remote'
  privateKey?: string
  nsec?: string
  bunkerUri?: string
  sessionData?: any
  clientSecretKey?: string | Uint8Array
  bunkerPubkey?: string
  relays?: string[]
}

// Global NDK instance
let globalNDK: NDK | null = null
let globalSigner: NDKSigner | null = null
let currentAuthData: AuthData | null = null

/**
 * Initialize NDK with relays
 */
export async function initializeNDK(relays?: string[]): Promise<NDK> {
  if (globalNDK) {
    return globalNDK
  }

  const defaultRelays = relays || [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.mom',
    'wss://relay.snort.social',
  ]

  console.log('[NDK Signer Manager] Initializing NDK with relays:', defaultRelays)

  globalNDK = new NDK({
    explicitRelayUrls: defaultRelays,
  })

  await globalNDK.connect()
  console.log('[NDK Signer Manager] NDK connected to relays')

  return globalNDK
}

/**
 * Get the global NDK instance
 */
export function getNDK(): NDK | null {
  return globalNDK
}

/**
 * Get the active signer
 */
export function getActiveSigner(): NDKSigner | null {
  return globalSigner
}

/**
 * Set the active signer
 */
export function setActiveSigner(signer: NDKSigner | null) {
  console.log('[NDK Signer Manager] Setting active signer:', !!signer)
  globalSigner = signer
  if (globalNDK) {
    globalNDK.signer = signer || undefined
  }
}

/**
 * Clear the active signer
 */
export function clearActiveSigner() {
  console.log('[NDK Signer Manager] Clearing active signer')
  globalSigner = null
  if (globalNDK) {
    globalNDK.signer = undefined
  }
  currentAuthData = null
}

/**
 * Initialize signer from auth data
 */
export async function initializeSignerFromAuthData(authData: AuthData): Promise<boolean> {
  try {
    console.log('[NDK Signer Manager] Initializing signer from auth data, method:', authData.authMethod)

    const ndk = await initializeNDK(authData.relays)

    currentAuthData = authData

    if (authData.authMethod === 'extension') {
      // For extension, NDK will automatically use window.nostr
      console.log('[NDK Signer Manager] Using browser extension (window.nostr)')
      ndk.signer = undefined // Let NDK use window.nostr automatically
      setActiveSigner(null) // Extension doesn't need explicit signer
      return true

    } else if (authData.authMethod === 'nsec') {
      // For private key
      console.log('[NDK Signer Manager] Creating private key signer')
      const privateKey = authData.privateKey || authData.nsec
      if (!privateKey) {
        throw new Error('No private key provided')
      }

      const signer = new NDKPrivateKeySigner(privateKey)
      setActiveSigner(signer)
      return true

    } else if (authData.authMethod === 'remote') {
      // For NIP-46 remote signer
      console.log('[NDK Signer Manager] Initializing NIP-46 remote signer')

      if (!authData.bunkerUri) {
        throw new Error('No bunker URI provided')
      }

      // Check if we already have an active signer (from login)
      if (globalSigner) {
        console.log('[NDK Signer Manager] ✅ Reusing existing remote signer from login')
        return true
      }

      console.log('[NDK Signer Manager] ⚠️ No existing signer, creating new connection...')

      // Create bunker NDK instance
      const bunkerNDK = new NDK({
        explicitRelayUrls: authData.relays || [
          'wss://relay.nsec.app',
          'wss://relay.damus.io',
          'wss://nos.lol',
        ],
      })

      await bunkerNDK.connect()
      console.log('[NDK Signer Manager] Bunker NDK connected')

      // Get or create local signer
      const localSignerKey = localStorage.getItem('nip46-local-key')
      const localSigner = localSignerKey
        ? new NDKPrivateKeySigner(localSignerKey)
        : NDKPrivateKeySigner.generate()

      if (!localSignerKey) {
        localStorage.setItem('nip46-local-key', localSigner.privateKey!)
      }

      // Create NIP-46 signer with proper permissions
      const remoteSigner = new NDKNip46Signer(bunkerNDK, authData.bunkerUri, localSigner, {
        // Request permissions for all the event kinds we need
        permissions: [
          'read',
          'write', 
          'sign_event',
          'nip04_encrypt',
          'nip04_decrypt'
        ]
      })

      console.log('[NDK Signer Manager] Waiting for remote signer to be ready...')
      await remoteSigner.blockUntilReady()
      console.log('[NDK Signer Manager] Remote signer ready')

      setActiveSigner(remoteSigner)
      return true
    }

    return false
  } catch (error) {
    console.error('[NDK Signer Manager] Failed to initialize signer:', error)
    return false
  }
}

/**
 * Sign an event using the appropriate signer
 */
export async function signEventWithRemote(unsignedEvent: NostrEvent, authData: AuthData): Promise<NostrEvent> {
  console.log('[NDK Signer Manager] Signing event, method:', authData.authMethod)

  try {
    const ndk = await initializeNDK()

    if (authData.authMethod === 'extension') {
      // Use browser extension
      if (!window.nostr) {
        throw new Error('Nostr extension not found')
      }
      const signedEvent = await window.nostr.signEvent(unsignedEvent)
      console.log('[NDK Signer Manager] Event signed with extension')
      return signedEvent

    } else if (authData.authMethod === 'nsec') {
      // Use private key signer
      if (!globalSigner) {
        throw new Error('No signer available')
      }

      const ndkEvent = new NDKEvent(ndk, unsignedEvent)
      await ndkEvent.sign(globalSigner)
      console.log('[NDK Signer Manager] Event signed with private key')
      return ndkEvent.rawEvent()

    } else if (authData.authMethod === 'remote') {
      // Use NIP-46 remote signer
      if (!globalSigner) {
        console.log('[NDK Signer Manager] No global signer, attempting to reconnect...')
        const reconnected = await initializeSigner(authData)
        if (!reconnected) {
          throw new Error('Failed to reconnect remote signer')
        }
      }

      // Ensure the remote signer is still connected and ready
      const nip46Signer = globalSigner as NDKNip46Signer
      if (!nip46Signer.isReady()) {
        console.log('[NDK Signer Manager] Remote signer not ready, attempting to reconnect...')
        const reconnected = await initializeSigner(authData)
        if (!reconnected) {
          throw new Error('Remote signer connection lost and failed to reconnect')
        }
      }

      const ndkEvent = new NDKEvent(ndk, unsignedEvent)
      await ndkEvent.sign(globalSigner)
      console.log('[NDK Signer Manager] Event signed with remote signer')
      return ndkEvent.rawEvent()
    }

    throw new Error(`Unsupported auth method: ${authData.authMethod}`)
  } catch (error) {
    console.error('[NDK Signer Manager] Failed to sign event:', error)
    throw error
  }
}

/**
 * Publish an event to relays
 */
export async function publishEventWithNDK(signedEvent: NostrEvent): Promise<string> {
  const ndk = await initializeNDK()

  console.log('[NDK Signer Manager] Publishing event...')

  const ndkEvent = new NDKEvent(ndk, signedEvent)
  const relays = await ndkEvent.publish()

  console.log('[NDK Signer Manager] Event published to', relays.size, 'relays')

  return signedEvent.id || ''
}

/**
 * Encrypt data using NIP-04
 */
export async function encryptWithRemote(plaintext: string, recipientPubkey: string, authData: AuthData): Promise<string> {
  console.log('[NDK Signer Manager] Encrypting with NIP-04...')

  if (authData.authMethod === 'remote' && globalSigner) {
    // For remote signer, use NDK's encryption if available
    // NDK's NIP-46 signer should handle nip04_encrypt
    const nip46Signer = globalSigner as NDKNip46Signer

    if (typeof (nip46Signer as any).encrypt === 'function') {
      return await (nip46Signer as any).encrypt(recipientPubkey, plaintext)
    }
  }

  // Fallback to nostr-tools nip04
  const { nip04 } = await import('nostr-tools/pure')

  let clientSecretKey = authData.clientSecretKey || authData.privateKey
  if (!clientSecretKey) {
    throw new Error('No secret key available for encryption')
  }

  if (typeof clientSecretKey === 'string') {
    clientSecretKey = new Uint8Array(
      clientSecretKey.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
    )
  }

  const sharedSecret = nip04.getSharedSecret(clientSecretKey, recipientPubkey)
  const encrypted = await nip04.encrypt(sharedSecret, plaintext)

  console.log('[NDK Signer Manager] Data encrypted successfully')
  return encrypted
}

/**
 * Decrypt data using NIP-04
 */
export async function decryptWithRemote(ciphertext: string, senderPubkey: string, authData: AuthData): Promise<string> {
  console.log('[NDK Signer Manager] Decrypting with NIP-04...')

  if (authData.authMethod === 'remote' && globalSigner) {
    // For remote signer, use NDK's decryption if available
    const nip46Signer = globalSigner as NDKNip46Signer

    if (typeof (nip46Signer as any).decrypt === 'function') {
      return await (nip46Signer as any).decrypt(senderPubkey, ciphertext)
    }
  }

  // Fallback to nostr-tools nip04
  const { nip04 } = await import('nostr-tools/pure')

  let clientSecretKey = authData.clientSecretKey || authData.privateKey
  if (!clientSecretKey) {
    throw new Error('No secret key available for decryption')
  }

  if (typeof clientSecretKey === 'string') {
    clientSecretKey = new Uint8Array(
      clientSecretKey.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
    )
  }

  const sharedSecret = nip04.getSharedSecret(clientSecretKey, senderPubkey)
  const decrypted = await nip04.decrypt(sharedSecret, ciphertext)

  console.log('[NDK Signer Manager] Data decrypted successfully')
  return decrypted
}

/**
 * Check if signer is ready
 */
export function isSignerReady(): boolean {
  return globalSigner !== null || currentAuthData?.authMethod === 'extension'
}

/**
 * Cleanup signer
 */
export async function cleanupSigner() {
  console.log('[NDK Signer Manager] Cleaning up signer...')
  clearActiveSigner()
}

/**
 * Check if the remote signer is connected and ready
 */
export function isRemoteSignerConnected(): boolean {
  if (!globalSigner) return false
  
  if (currentAuthData?.authMethod === 'remote') {
    const nip46Signer = globalSigner as NDKNip46Signer
    return nip46Signer.isReady()
  }
  
  return false
}

// Declare window.nostr for TypeScript
declare global {
  interface Window {
    nostr?: {
      signEvent: (event: any) => Promise<any>
      getPublicKey: () => Promise<string>
    }
  }
}
