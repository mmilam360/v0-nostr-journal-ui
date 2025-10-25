'use client'

import React, { useState, useEffect } from 'react'
import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import QRCode from 'qrcode'
import { Copy, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RemoteSignerModalProps {
  isOpen: boolean
  onClose: () => void
  onLoginSuccess: (authData: any) => void
}

export default function RemoteSignerModal({ isOpen, onClose, onLoginSuccess }: RemoteSignerModalProps) {
  const [nostrConnectUrl, setNostrConnectUrl] = useState('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [bunkerUrl, setBunkerUrl] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState(false)

  // Generate nostrconnect URL and QR code when modal opens
  useEffect(() => {
    if (isOpen && !nostrConnectUrl) {
      console.log('[RemoteSignerModal] Modal opened, generating URL...')
      generateNostrConnectUrl()
    }
  }, [isOpen, nostrConnectUrl])

  const generateNostrConnectUrl = async () => {
    try {
      console.log('[RemoteSignerModal] Generating nostrconnect URL...')
      setErrorMessage('')

      // Create NDK instance
      const ndk = new NDK({
        explicitRelayUrls: [
          'wss://relay.nsec.app',
          'wss://relay.damus.io',
          'wss://nos.lol',
        ],
      })

      await ndk.connect()
      console.log('[RemoteSignerModal] NDK connected')

      // Get or create local signer
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
      const connectUri = `nostrconnect://${localPubkey}?relay=wss://relay.nsec.app&metadata=${encodeURIComponent(JSON.stringify({
        name: 'Nostr Journal',
        description: 'Private journaling on Nostr'
      }))}`

      setNostrConnectUrl(connectUri)
      console.log('[RemoteSignerModal] Generated nostrconnect URI:', connectUri)

      // Generate QR code
      console.log('[RemoteSignerModal] Generating QR code...')
      const qrDataUrl = await QRCode.toDataURL(connectUri, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      setQrCodeDataUrl(qrDataUrl)
      console.log('[RemoteSignerModal] QR code generated successfully')

      // Start listening for connections
      startNostrConnectListening(ndk, localSigner, localPubkey)

    } catch (error) {
      console.error('[RemoteSignerModal] Failed to generate nostrconnect URL:', error)
      setErrorMessage('Failed to generate connection URL')
      setConnectionStatus('error')
    }
  }

  const startNostrConnectListening = async (ndk: NDK, localSigner: NDKPrivateKeySigner, localPubkey: string) => {
    try {
      console.log('[RemoteSignerModal] Starting nostrconnect listening...')
      setConnectionStatus('connecting')

      // Subscribe to NIP-46 connection requests
      const filter = {
        kinds: [24133], // NIP-46 request kind
        '#p': [localPubkey],
        since: Math.floor(Date.now() / 1000)
      }

      console.log('[RemoteSignerModal] Subscribing to NIP-46 connection requests...')

      const sub = ndk.subscribe(filter, { closeOnEose: false })

      // Wait for connection with timeout
      const connectionPromise = new Promise<{ remotePubkey: string; remoteSigner: NDKNip46Signer }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          sub.stop()
          reject(new Error('Connection timeout after 120 seconds'))
        }, 120000)

        sub.on('event', async (event: any) => {
          try {
            console.log('[RemoteSignerModal] 📬 Received NIP-46 event from:', event.pubkey)

            // Create bunker URL from the remote signer's pubkey
            const bunkerUrl = `bunker://${event.pubkey}?relay=wss://relay.nsec.app`
            console.log('[RemoteSignerModal] Creating signer with bunker URL:', bunkerUrl)

            // Create the remote signer with the bunker URL and relay URLs
            const relayUrls = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol']

            // Request comprehensive permissions upfront
            const permissions = {
              name: 'Nostr Journal',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://nostr-journal.com',
              perms: 'sign_event,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt'
            }

            const remoteSigner = new NDKNip46Signer(ndk, bunkerUrl, localSigner, relayUrls, permissions)

            // Wait for signer to be ready
            await remoteSigner.blockUntilReady()
            console.log('[RemoteSignerModal] Remote signer connected!')

            const user = await remoteSigner.user()
            const remotePubkey = user.pubkey

            clearTimeout(timeout)
            sub.stop()
            resolve({ remotePubkey, remoteSigner })
          } catch (error) {
            console.error('[RemoteSignerModal] Error handling NIP-46 event:', error)
            reject(error)
          }
        })

        sub.on('eose', () => {
          console.log('[RemoteSignerModal] End of stored events, waiting for new connections...')
        })
      })

      const { remotePubkey, remoteSigner } = await connectionPromise

      // CRITICAL: Save signer to global state so main app can reuse it
      const { setActiveSigner } = await import('@/lib/ndk-signer-manager')
      setActiveSigner(remoteSigner)
      console.log('[RemoteSignerModal] ✅ Saved remote signer to global state for instant reuse')

      // Store bunker URI for reconnection
      const bunkerUri = `bunker://${remotePubkey}?relay=wss://relay.nsec.app`
      localStorage.setItem('nip46-bunker-uri', bunkerUri)

      // Create auth data
      const authData = {
        pubkey: remotePubkey,
        authMethod: 'remote' as const,
        bunkerUri: bunkerUri,
        relays: ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'],
        sessionData: { bunkerUri },
        clientSecretKey: localSigner.privateKey,
        bunkerPubkey: remotePubkey
      }

      console.log('[RemoteSignerModal] ✅ Nostrconnect connection successful!')
      setConnectionStatus('connected')

      // Close modal and call success callback
      onClose()
      onLoginSuccess(authData)

    } catch (error) {
      console.error('[RemoteSignerModal] Nostrconnect connection failed:', error)
      setErrorMessage('Connection failed. Please try again.')
      setConnectionStatus('error')
    }
  }

  const handleBunkerConnect = async () => {
    if (!bunkerUrl.trim()) {
      setErrorMessage('Please enter a bunker URL')
      return
    }

    try {
      console.log('[RemoteSignerModal] Connecting with bunker URL:', bunkerUrl)
      setConnectionStatus('connecting')
      setIsConnecting(true)
      setErrorMessage('')

      // Create NDK instance
      const ndk = new NDK({
        explicitRelayUrls: [
          'wss://relay.nsec.app',
          'wss://relay.damus.io',
          'wss://nos.lol',
        ],
      })

      await ndk.connect()
      console.log('[RemoteSignerModal] NDK connected')

      // Get or create local signer
      const localSignerKey = localStorage.getItem('nip46-local-key')
      const localSigner = localSignerKey
        ? new NDKPrivateKeySigner(localSignerKey)
        : NDKPrivateKeySigner.generate()

      if (!localSignerKey) {
        localStorage.setItem('nip46-local-key', localSigner.privateKey!)
      }

      // Create NIP-46 signer with relay URLs
      const relayUrls = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol']

      // Request comprehensive permissions upfront
      const permissions = {
        name: 'Nostr Journal',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://nostr-journal.com',
        perms: 'sign_event,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt'
      }

      const remoteSigner = new NDKNip46Signer(ndk, bunkerUrl, localSigner, relayUrls, permissions)

      // Wait for connection
      await remoteSigner.blockUntilReady()
      console.log('[RemoteSignerModal] Remote signer connected!')

      // Get the remote signer's pubkey
      const remotePubkey = await remoteSigner.user().then(u => u.pubkey)

      // CRITICAL: Save signer to global state so main app can reuse it
      const { setActiveSigner } = await import('@/lib/ndk-signer-manager')
      setActiveSigner(remoteSigner)
      console.log('[RemoteSignerModal] ✅ Saved remote signer to global state for instant reuse')

      // Store bunker URI for reconnection
      localStorage.setItem('nip46-bunker-uri', bunkerUrl)

      // Create auth data
      const authData = {
        pubkey: remotePubkey,
        authMethod: 'remote' as const,
        bunkerUri: bunkerUrl,
        relays: ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'],
        sessionData: { bunkerUri: bunkerUrl },
        clientSecretKey: localSigner.privateKey,
        bunkerPubkey: remotePubkey
      }

      console.log('[RemoteSignerModal] ✅ Bunker connection successful!')
      setConnectionStatus('connected')

      // Close modal and call success callback
      onClose()
      onLoginSuccess(authData)

    } catch (error) {
      console.error('[RemoteSignerModal] Bunker connection failed:', error)
      setErrorMessage('Connection failed. Please check your bunker URL.')
      setConnectionStatus('error')
      setIsConnecting(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      console.log('[RemoteSignerModal] Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('[RemoteSignerModal] Failed to copy:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg p-6 max-w-md w-full shadow-xl border-2 border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Remote Signer</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions */}
        <p className="text-muted-foreground text-sm mb-6">
          Scan the QR code with your remote signer app (like nsec.app) or paste a bunker:// URL below
        </p>

        {/* QR Code */}
        <div className="mb-6">
          {qrCodeDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-white rounded-lg border-2 border-border">
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code"
                  className="w-64 h-64"
                />
              </div>
              {connectionStatus === 'connecting' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching for connection in background...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-64 h-64 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Nostr Connect URL */}
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Connection URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nostrConnectUrl || 'Generating...'}
              readOnly
              className="flex-1 px-3 py-2 border-2 border-border rounded-lg text-sm bg-muted text-foreground font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(nostrConnectUrl)}
              disabled={!nostrConnectUrl}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Separator */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or paste bunker URL</span>
          </div>
        </div>

        {/* Bunker URL Input */}
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Bunker URL
          </label>
          <input
            type="text"
            value={bunkerUrl}
            onChange={(e) => setBunkerUrl(e.target.value)}
            placeholder="bunker://..."
            className="w-full px-3 py-2 border-2 border-border hover:border-primary focus:border-primary rounded-lg text-sm bg-background text-foreground transition-colors"
          />
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-destructive/10 border-2 border-destructive/50 rounded-lg text-destructive text-sm">
            {errorMessage}
          </div>
        )}

        {/* Bunker Connect Button */}
        <Button
          onClick={handleBunkerConnect}
          disabled={isConnecting || !bunkerUrl.trim()}
          className="w-full"
          size="lg"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect with Bunker URL'
          )}
        </Button>
      </div>
    </div>
  )
}