"use client"

/**
 * NDK Provider - React Context for NDK integration
 * This provides the NDK instance and authentication methods throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import NDK, {
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKEvent,
  type NDKSigner,
  type NostrEvent
} from '@nostr-dev-kit/ndk'

// Define auth data structure
export interface NDKAuthData {
  pubkey: string
  authMethod: 'extension' | 'nsec' | 'remote'
  privateKey?: string
  nsec?: string
  bunkerUri?: string
  sessionData?: any
}

interface NDKContextType {
  ndk: NDK | null
  currentUser: { pubkey: string } | null
  signer: NDKSigner | null
  isConnected: boolean

  // Authentication methods
  loginWithExtension: () => Promise<NDKAuthData>
  loginWithPrivateKey: (nsecOrHex: string) => Promise<NDKAuthData>
  loginWithNip46: (bunkerUri: string) => Promise<NDKAuthData>
  loginWithNip46QR: () => Promise<{ connectUri: string; waitForConnection: () => Promise<NDKAuthData> }>
  logout: () => void

  // Event methods
  signEvent: (event: NostrEvent) => Promise<NostrEvent>
  publishEvent: (event: NDKEvent) => Promise<Set<any>>
}

const NDKContext = createContext<NDKContextType | null>(null)

export function NDKProvider({ children }: { children: React.ReactNode }) {
  const [ndk, setNdk] = useState<NDK | null>(null)
  const [currentUser, setCurrentUser] = useState<{ pubkey: string } | null>(null)
  const [signer, setSigner] = useState<NDKSigner | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Initialize NDK on mount
  useEffect(() => {
    const initNDK = async () => {
      console.log('[NDK] Initializing NDK instance...')

      const ndkInstance = new NDK({
        explicitRelayUrls: [
          'wss://relay.damus.io',
          'wss://nos.lol',
          'wss://relay.nostr.band',
          'wss://nostr.mom',
          'wss://relay.snort.social',
        ],
      })

      try {
        await ndkInstance.connect()
        console.log('[NDK] Connected to relays')
        setNdk(ndkInstance)
        setIsConnected(true)
      } catch (error) {
        console.error('[NDK] Failed to connect:', error)
      }
    }

    initNDK()

    return () => {
      // Cleanup on unmount
      console.log('[NDK] Cleaning up...')
    }
  }, [])

  // Login with browser extension (NIP-07)
  const loginWithExtension = useCallback(async (): Promise<NDKAuthData> => {
    if (!ndk) throw new Error('NDK not initialized')

    console.log('[NDK] Logging in with browser extension...')

    if (!window.nostr) {
      throw new Error('Nostr extension not found')
    }

    const pubkey = await window.nostr.getPublicKey()
    console.log('[NDK] Got pubkey from extension:', pubkey)

    // NDK will automatically use window.nostr if available
    ndk.signer = undefined // Let NDK use window.nostr

    setCurrentUser({ pubkey })

    return {
      pubkey,
      authMethod: 'extension',
    }
  }, [ndk])

  // Login with private key (nsec or hex)
  const loginWithPrivateKey = useCallback(async (nsecOrHex: string): Promise<NDKAuthData> => {
    if (!ndk) throw new Error('NDK not initialized')

    console.log('[NDK] Logging in with private key...')

    let privateKeySigner: NDKPrivateKeySigner

    if (nsecOrHex.startsWith('nsec1')) {
      privateKeySigner = new NDKPrivateKeySigner(nsecOrHex)
    } else {
      privateKeySigner = new NDKPrivateKeySigner(nsecOrHex)
    }

    ndk.signer = privateKeySigner
    setSigner(privateKeySigner)

    const user = await privateKeySigner.user()
    const pubkey = user.pubkey

    console.log('[NDK] Logged in with pubkey:', pubkey)
    setCurrentUser({ pubkey })

    return {
      pubkey,
      authMethod: 'nsec',
      privateKey: nsecOrHex.startsWith('nsec1') ? nsecOrHex : nsecOrHex,
      nsec: nsecOrHex.startsWith('nsec1') ? nsecOrHex : undefined,
    }
  }, [ndk])

  // Login with NIP-46 remote signer (bunker:// URL)
  const loginWithNip46 = useCallback(async (bunkerUri: string): Promise<NDKAuthData> => {
    if (!ndk) throw new Error('NDK not initialized')

    console.log('[NDK] Logging in with NIP-46 bunker URL...')
    console.log('[NDK] Bunker URI:', bunkerUri)

    if (!bunkerUri.startsWith('bunker://')) {
      throw new Error('Invalid bunker URI. Must start with bunker://')
    }

    // Create a separate NDK instance for the bunker relay
    const bunkerNDK = new NDK({
      explicitRelayUrls: [
        'wss://relay.nsec.app',
        'wss://relay.damus.io',
        'wss://nos.lol',
      ],
    })

    await bunkerNDK.connect()
    console.log('[NDK] Bunker NDK connected')

    // Get or create a local signer for the NIP-46 connection
    const localSignerKey = localStorage.getItem('nip46-local-key')
    const localSigner = localSignerKey
      ? new NDKPrivateKeySigner(localSignerKey)
      : NDKPrivateKeySigner.generate()

    if (!localSignerKey) {
      localStorage.setItem('nip46-local-key', localSigner.privateKey!)
    }

    // Create NIP-46 signer
    const remoteSigner = new NDKNip46Signer(bunkerNDK, bunkerUri, localSigner)

    console.log('[NDK] Waiting for remote signer to be ready...')

    // Wait for connection to be established
    const user = await remoteSigner.blockUntilReady()
    const pubkey = user.pubkey

    console.log('[NDK] NIP-46 connection established, pubkey:', pubkey)

    ndk.signer = remoteSigner
    setSigner(remoteSigner)
    setCurrentUser({ pubkey })

    // Store bunker URI for reconnection
    localStorage.setItem('nip46-bunker-uri', bunkerUri)

    return {
      pubkey,
      authMethod: 'remote',
      bunkerUri,
      sessionData: { bunkerUri },
    }
  }, [ndk])

  // Login with NIP-46 using QR code (client-initiated flow)
  const loginWithNip46QR = useCallback(async () => {
    if (!ndk) throw new Error('NDK not initialized')

    console.log('[NDK] Starting NIP-46 client-initiated flow (QR code)...')

    // Create a separate NDK instance for the bunker relay
    const bunkerNDK = new NDK({
      explicitRelayUrls: [
        'wss://relay.nsec.app',
        'wss://relay.damus.io',
        'wss://nos.lol',
      ],
    })

    await bunkerNDK.connect()
    console.log('[NDK] Bunker NDK connected')

    // Get or create a local signer
    const localSignerKey = localStorage.getItem('nip46-local-key')
    const localSigner = localSignerKey
      ? new NDKPrivateKeySigner(localSignerKey)
      : NDKPrivateKeySigner.generate()

    if (!localSignerKey) {
      localStorage.setItem('nip46-local-key', localSigner.privateKey!)
    }

    const localUser = await localSigner.user()
    const localPubkey = localUser.pubkey

    // Create the nostrconnect:// URI
    const connectUri = `nostrconnect://${localPubkey}?relay=wss://relay.nsec.app&metadata=${encodeURIComponent(JSON.stringify({ name: 'Nostr Journal', description: 'Private journaling on Nostr' }))}`

    console.log('[NDK] Generated connect URI:', connectUri)

    // Function to wait for connection
    const waitForConnection = async (): Promise<NDKAuthData> => {
      console.log('[NDK] Waiting for remote signer to scan QR code...')

      // Create NIP-46 signer (this will listen for connection)
      const remoteSigner = new NDKNip46Signer(bunkerNDK, localPubkey, localSigner)

      // Listen for auth URL events
      remoteSigner.on('authUrl', (url: string) => {
        console.log('[NDK] Auth URL received (if needed):', url)
      })

      // Wait for connection with timeout
      const timeoutMs = 120000 // 2 minutes
      const connectionPromise = remoteSigner.blockUntilReady()
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Connection timeout after ${timeoutMs / 1000} seconds`)), timeoutMs)
      })

      const user = await Promise.race([connectionPromise, timeoutPromise])
      const pubkey = user.pubkey

      console.log('[NDK] NIP-46 connection established via QR, pubkey:', pubkey)

      ndk.signer = remoteSigner
      setSigner(remoteSigner)
      setCurrentUser({ pubkey })

      return {
        pubkey,
        authMethod: 'remote',
        bunkerUri: connectUri,
        sessionData: { connectUri },
      }
    }

    return {
      connectUri,
      waitForConnection,
    }
  }, [ndk])

  // Logout
  const logout = useCallback(() => {
    console.log('[NDK] Logging out...')
    setSigner(null)
    setCurrentUser(null)
    if (ndk) {
      ndk.signer = undefined
    }
  }, [ndk])

  // Sign event
  const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent> => {
    if (!ndk) throw new Error('NDK not initialized')
    if (!ndk.signer) {
      // Try to use window.nostr for extension
      if (window.nostr) {
        return await window.nostr.signEvent(event)
      }
      throw new Error('No signer available')
    }

    console.log('[NDK] Signing event with NDK signer...')

    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.sign(ndk.signer)

    return ndkEvent.rawEvent()
  }, [ndk])

  // Publish event
  const publishEvent = useCallback(async (event: NDKEvent): Promise<Set<any>> => {
    if (!ndk) throw new Error('NDK not initialized')

    console.log('[NDK] Publishing event...')
    const relays = await event.publish()
    console.log('[NDK] Event published to', relays.size, 'relays')

    return relays
  }, [ndk])

  const value: NDKContextType = {
    ndk,
    currentUser,
    signer,
    isConnected,
    loginWithExtension,
    loginWithPrivateKey,
    loginWithNip46,
    loginWithNip46QR,
    logout,
    signEvent,
    publishEvent,
  }

  return <NDKContext.Provider value={value}>{children}</NDKContext.Provider>
}

// Hook to use NDK context
export function useNDK() {
  const context = useContext(NDKContext)
  if (!context) {
    throw new Error('useNDK must be used within NDKProvider')
  }
  return context
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
