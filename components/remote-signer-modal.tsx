'use client'

import React, { useState, useEffect } from 'react'
import { NDK, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import QRCode from 'qrcode'

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
  const [isGenerating, setIsGenerating] = useState(false)

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
      setIsGenerating(true)
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
      const qrCodeDataUrl = await QRCode.toDataURL(connectUri, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      setQrCodeDataUrl(qrCodeDataUrl)
      console.log('[RemoteSignerModal] QR code generated successfully')

      // Start listening for connections
      startNostrConnectListening(ndk, localSigner, localPubkey)

    } catch (error) {
      console.error('[RemoteSignerModal] Failed to generate nostrconnect URL:', error)
      setErrorMessage('Failed to generate connection URL')
      setConnectionStatus('error')
      setIsGenerating(false)
    }
  }

  const startNostrConnectListening = async (ndk: NDK, localSigner: NDKPrivateKeySigner, localPubkey: string) => {
    try {
      console.log('[RemoteSignerModal] Starting nostrconnect listening...')
      setConnectionStatus('connecting')
      setIsConnecting(true)

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

            // Create the remote signer with the actual remote pubkey
            const remoteSigner = new NDKNip46Signer(ndk, event.pubkey, localSigner, {
              permissions: [
                'read',
                'write',
                'sign_event',
                'nip04_encrypt',
                'nip04_decrypt'
              ]
            })

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
      setIsGenerating(false)

      // Close modal and call success callback
      onClose()
      onLoginSuccess(authData)

    } catch (error) {
      console.error('[RemoteSignerModal] Nostrconnect connection failed:', error)
      setErrorMessage('Connection failed. Please try again.')
      setConnectionStatus('error')
      setIsConnecting(false)
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

      // Create NIP-46 signer with proper permissions
      const remoteSigner = new NDKNip46Signer(ndk, bunkerUrl, localSigner, {
        permissions: [
          'read',
          'write',
          'sign_event',
          'nip04_encrypt',
          'nip04_decrypt'
        ]
      })

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
      console.log('[RemoteSignerModal] Copied to clipboard')
    } catch (error) {
      console.error('[RemoteSignerModal] Failed to copy:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Remote signer</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Instructions */}
        <p className="text-gray-600 text-sm mb-6">
          Use the below URL to connect to your bunker
        </p>

        {/* QR Code */}
        {isGenerating ? (
          <div className="flex justify-center mb-6">
            <div className="w-64 h-64 bg-gray-100 rounded flex items-center justify-center">
              <div className="text-gray-500">Generating QR code...</div>
            </div>
          </div>
        ) : qrCodeDataUrl ? (
          <div className="flex justify-center mb-6">
            <img 
              src={qrCodeDataUrl} 
              alt="QR Code" 
              className="w-64 h-64"
            />
          </div>
        ) : null}

        {/* Nostr Connect URL */}
        <div className="mb-4">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={isGenerating ? 'Generating connection URL...' : nostrConnectUrl}
              readOnly
              className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded text-sm bg-gray-50"
            />
            <button
              onClick={() => copyToClipboard(nostrConnectUrl)}
              disabled={!nostrConnectUrl}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="text-center text-gray-500 text-sm mb-4">Or</div>

        {/* Bunker URL Input */}
        <div className="mb-6">
          <input
            type="text"
            value={bunkerUrl}
            onChange={(e) => setBunkerUrl(e.target.value)}
            placeholder="bunker://..."
            className="w-full px-3 py-2 border border-dashed border-gray-300 rounded text-sm bg-gray-50"
          />
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Connection Status */}
        {connectionStatus === 'connecting' && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
            {isConnecting ? 'Connecting...' : 'Waiting for connection...'}
          </div>
        )}

        {/* Log in Button */}
        <button
          onClick={handleBunkerConnect}
          disabled={isConnecting || !bunkerUrl.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded transition-colors"
        >
          Log in
        </button>
      </div>
    </div>
  )
}
