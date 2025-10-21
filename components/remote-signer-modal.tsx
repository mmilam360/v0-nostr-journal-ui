'use client'

import React, { useState, useEffect } from 'react'
import { NDK, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import QRCode from 'qrcode'
import { initializeSignerFromAuthData } from '@/lib/ndk-signer-manager'

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

      // For nostrconnect, we generate the QR code and wait for the remote signer to connect
      // The actual NIP-46 connection will be handled by the remote signer app
      // We just need to wait and check for connection status
      
      console.log('[RemoteSignerModal] QR code generated, waiting for remote signer...')
      
      // Set up a simple polling mechanism to check for connection
      const checkForConnection = async () => {
        try {
          // Check if we have a connected signer in the NDK signer manager
          const { getActiveSigner } = await import('@/lib/ndk-signer-manager')
          const activeSigner = getActiveSigner()
          
          if (activeSigner) {
            console.log('[RemoteSignerModal] ✅ Found active signer - connection successful!')
            setConnectionStatus('connected')
            
            const remoteUser = await activeSigner.user()
            const remotePubkey = remoteUser.pubkey
            
            const authData = {
              pubkey: remotePubkey,
              authMethod: 'remote' as const,
              bunkerUri: nostrConnectUrl,
              relays: ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'],
              sessionData: { bunkerUri: nostrConnectUrl },
              clientSecretKey: localSigner.privateKey,
              bunkerPubkey: remotePubkey
            }
            
            // Close modal and call success callback
            onClose()
            onLoginSuccess(authData)
            return
          }
          
          // If no connection yet, keep checking every 2 seconds
          setTimeout(checkForConnection, 2000)
          
        } catch (error) {
          console.log('[RemoteSignerModal] Still waiting for connection...')
          setTimeout(checkForConnection, 2000)
        }
      }
      
      // Start checking for connection
      checkForConnection()

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

      // Create auth data for bunker connection
      const authData = {
        pubkey: localPubkey, // This will be updated when remote signer connects
        authMethod: 'remote' as const,
        bunkerUri: bunkerUrl,
        relays: ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'],
        sessionData: { bunkerUri: bunkerUrl },
        clientSecretKey: localSigner.privateKey,
        bunkerPubkey: localPubkey
      }

      console.log('[RemoteSignerModal] Initializing bunker connection via NDK signer manager...')
      
      // Use the NDK signer manager to handle the bunker connection
      const connected = await initializeSignerFromAuthData(authData)
      
      if (connected) {
        console.log('[RemoteSignerModal] ✅ Bunker connection successful!')
        setConnectionStatus('connected')
        
        // Get the actual remote pubkey from the connected signer
        const { getActiveSigner } = await import('@/lib/ndk-signer-manager')
        const activeSigner = getActiveSigner()
        
        if (activeSigner) {
          const remoteUser = await activeSigner.user()
          const remotePubkey = remoteUser.pubkey
          
          // Update auth data with actual remote pubkey
          const finalAuthData = {
            ...authData,
            pubkey: remotePubkey,
            bunkerPubkey: remotePubkey
          }
          
          // Close modal and call success callback
          onClose()
          onLoginSuccess(finalAuthData)
        }
      } else {
        throw new Error('Failed to establish bunker connection')
      }

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
    <div className="fixed inset-0 bg-black bg-opacity-20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
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
