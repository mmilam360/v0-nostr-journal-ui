/**
 * Modern Bunker Authentication Modal
 * Implements improved mobile UX with QR codes and clickable links
 */

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  QrCode, 
  Smartphone, 
  Monitor, 
  Copy, 
  Check,
  AlertTriangle,
  Loader2,
  ExternalLink,
  X
} from 'lucide-react'
import QRCodeReact from 'qrcode.react'
import { 
  AuthState, 
  connectViaQR, 
  connectViaBunker, 
  fastReconnect,
  createConnectURI,
  generateClientKeypair,
  isMobile,
  supportsNostrConnect,
  clearDebugLogs
} from '@/lib/bunker-auth-v2'

interface BunkerAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (pubkey: string, signer: any) => void
}

export function BunkerAuthModal({ isOpen, onClose, onSuccess }: BunkerAuthModalProps) {
  const [authState, setAuthState] = useState<AuthState>({ status: 'disconnected' })
  const [bunkerUrl, setBunkerUrl] = useState('')
  const [connectURI, setConnectURI] = useState('')
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)

  // App metadata
  const appMetadata = {
    name: 'Nostr Journal',
    url: window.location.origin,
    description: 'Encrypted journaling with Lightning incentives'
  }

  // Primary relay for connections
  const primaryRelay = 'wss://relay.nsecbunker.com'

  // Fast reconnect on mount
  useEffect(() => {
    if (isOpen) {
      fastReconnect(setAuthState).then(signer => {
        if (signer) {
          onSuccess(authState.status === 'connected' ? authState.pubkey : '', signer)
        }
      })
    }
  }, [isOpen])

  // Mobile return detection for same-device auth
  useEffect(() => {
    // Only run if currently connecting
    if (authState.status !== 'connecting' && authState.status !== 'waiting_approval') return
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[BunkerAuth] User returned to app')
        
        // Wait a moment for bunker response to arrive
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Check if connection completed while we were away
        if (authState.status === 'connected') {
          console.log('[BunkerAuth] Connection verified after return!')
          onSuccess(authState.pubkey, authState.signer)
        } else {
          console.log('[BunkerAuth] Still not connected after return')
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [authState.status, authState.pubkey, authState.signer])

  // Handle auth state changes
  useEffect(() => {
    if (authState.status === 'connected') {
      onSuccess(authState.pubkey, authState.signer)
    }
  }, [authState])

  const handleQRConnect = async () => {
    try {
      const { secretKey, pubkey } = generateClientKeypair()
      const connectURI = createConnectURI(
        pubkey,
        primaryRelay,
        appMetadata
      )
      
      setConnectURI(connectURI)
      setShowQR(true)
      
      const signer = await connectViaQR(secretKey, primaryRelay, appMetadata, setAuthState)
      if (signer) {
        // Success handled by useEffect
      }
    } catch (error) {
      console.error('QR connection failed:', error)
    }
  }

  const handleBunkerConnect = async () => {
    if (!bunkerUrl.trim()) return
    
    try {
      const signer = await connectViaBunker(bunkerUrl, setAuthState)
      if (signer) {
        // Success handled by useEffect
      }
    } catch (error) {
      console.error('Bunker connection failed:', error)
    }
  }

  const handleCopyURI = async () => {
    try {
      await navigator.clipboard.writeText(connectURI)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleMobileConnect = () => {
    if (supportsNostrConnect()) {
      // Try to open nostrconnect:// link directly
      window.location.href = connectURI
    } else {
      // Fallback to copying to clipboard
      handleCopyURI()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Connect Remote Signer</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Auth State Display */}
        <div className="mb-6">
          {authState.status === 'connecting' && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-blue-800 dark:text-blue-200">
                {authState.method === 'qr' ? 'Setting up QR code...' : 'Connecting to bunker...'}
              </span>
            </div>
          )}

          {authState.status === 'waiting_approval' && (
            <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-yellow-600" />
              <span className="text-yellow-800 dark:text-yellow-200">
                Waiting for approval in your signer app...
              </span>
            </div>
          )}

          {authState.status === 'error' && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-red-800 dark:text-red-200">{authState.error}</span>
            </div>
          )}

          {authState.status === 'connected' && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
              <span className="text-green-800 dark:text-green-200">
                Connected successfully!
              </span>
            </div>
          )}
        </div>

        {/* Connection Methods */}
        {authState.status === 'disconnected' && (
          <div className="space-y-4">
            {/* QR Code Method */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <QrCode className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Scan QR Code</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Scan with your mobile signer app (nsec.app, Amber, etc.)
              </p>
              
              {showQR && connectURI ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <QRCodeReact 
                      value={connectURI} 
                      size={200}
                      level="M"
                      includeMargin
                    />
                  </div>
                  
                  {isMobile() && (
                    <div className="space-y-2">
                      <Button 
                        onClick={handleMobileConnect}
                        className="w-full"
                        variant="outline"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in Signer App
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Input 
                      value={connectURI} 
                      readOnly 
                      className="flex-1 text-xs"
                    />
                    <Button 
                      onClick={handleCopyURI}
                      variant="outline"
                      size="sm"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  onClick={handleQRConnect}
                  className="w-full"
                  disabled={authState.status !== 'disconnected'}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Generate QR Code
                </Button>
              )}
            </div>

            {/* Bunker URL Method */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Monitor className="w-5 h-5 text-green-600" />
                <span className="font-medium">Bunker URL</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Paste a bunker:// URL from your signer app
              </p>
              
              <div className="space-y-3">
                <Input
                  placeholder="bunker://..."
                  value={bunkerUrl}
                  onChange={(e) => setBunkerUrl(e.target.value)}
                  className="text-sm"
                />
                <Button 
                  onClick={handleBunkerConnect}
                  className="w-full"
                  disabled={!bunkerUrl.trim() || authState.status !== 'disconnected'}
                >
                  Connect
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Device-specific instructions */}
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h3 className="font-medium mb-2">Device-specific instructions:</h3>
          {isMobile() ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>• Use QR code to connect with another device</p>
              <p>• Use "Open in Signer App" for same-device connection</p>
              <p>• Supported apps: nsec.app, Amber, and others</p>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>• Scan QR code with your mobile signer app</p>
              <p>• Or paste bunker:// URL from your signer app</p>
              <p>• Recommended: nsec.app, Amber, or other NIP-46 signers</p>
            </div>
          )}
        </div>

        {/* Debug Log Viewer - Only shows in development */}
        {process.env.NODE_ENV === 'development' && (
          <details style={{ 
            position: 'fixed', 
            bottom: 0, 
            right: 0, 
            background: 'rgba(0,0,0,0.95)',
            color: 'lime',
            fontSize: '10px',
            padding: '4px',
            maxWidth: '300px',
            maxHeight: '150px',
            overflow: 'auto',
            zIndex: 9999,
            border: '1px solid lime'
          }}>
            <summary style={{ cursor: 'pointer', marginBottom: '4px' }}>
              Debug Logs
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  clearDebugLogs()
                  window.location.reload()
                }}
                style={{ 
                  marginLeft: '8px', 
                  background: 'transparent', 
                  border: '1px solid lime', 
                  color: 'lime', 
                  padding: '2px 4px',
                  fontSize: '8px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </summary>
            {(() => {
              try {
                const logs = JSON.parse(sessionStorage.getItem('debug_logs') || '[]')
                return logs.map((log: string, i: number) => (
                  <div key={i} style={{ marginBottom: '2px', wordBreak: 'break-all' }}>
                    {log}
                  </div>
                ))
              } catch {
                return <div>No logs available</div>
              }
            })()}
          </details>
        )}
      </div>
    </div>
  )
}
