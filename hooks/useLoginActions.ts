"use client"

import { useCallback } from 'react'

export interface AuthData {
  pubkey: string
  authMethod: 'extension' | 'nsec' | 'remote'
  privateKey?: string
  bunkerUri?: string
  bunkerPubkey?: string
  clientSecretKey?: string
  relays?: string[]
  sessionData?: any
}

interface LoginActions {
  nsec: (nsec: string) => Promise<AuthData>
  bunker: (uri: string) => Promise<AuthData>
  extension: () => Promise<AuthData>
  logout: () => void
}

export function useLoginActions(): LoginActions {
  
  const nsec = useCallback(async (nsec: string): Promise<AuthData> => {
    const { getPublicKey, nip04 } = await import('nostr-tools')
    
    // Convert nsec to private key
    const privateKey = nsec.startsWith('nsec') ? 
      await import('nostr-tools').then(({ nip19 }) => nip19.decode(nsec).data as string) :
      nsec

    const pubkey = getPublicKey(privateKey)

    return {
      pubkey,
      authMethod: 'nsec',
      privateKey,
    }
  }, [])

  const bunker = useCallback(async (uri: string): Promise<AuthData> => {
    // Use our existing bunker connection logic
    const { Nip46RemoteSigner } = await import('nostr-signer-connector')
    
    // Parse bunker URI
    const url = new URL(uri)
    const relays = url.searchParams.get('relay')?.split(',') || [
      "wss://relay.damus.io",
      "wss://nos.lol", 
      "wss://relay.primal.net"
    ]

    // Connect to bunker
    const { signer, session } = await Nip46RemoteSigner.connectToRemote(relays, uri, {
      name: "Nostr Journal",
      url: window.location.origin,
      description: "A simple journal app"
    })

    const pubkey = await signer.getPublicKey()

    return {
      pubkey,
      authMethod: 'remote',
      bunkerUri: uri,
      bunkerPubkey: pubkey,
      relays,
      sessionData: session,
    }
  }, [])

  const extension = useCallback(async (): Promise<AuthData> => {
    if (!window.nostr) {
      throw new Error('Nostr extension not found')
    }

    const pubkey = await window.nostr.getPublicKey()

    return {
      pubkey,
      authMethod: 'extension',
    }
  }, [])

  const logout = useCallback(() => {
    // Clear any stored session data
    localStorage.removeItem('nostr_journal_session')
    // Reload the page to reset state
    window.location.reload()
  }, [])

  return {
    nsec,
    bunker,
    extension,
    logout,
  }
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>
      signEvent: (event: any) => Promise<any>
    }
  }
}
