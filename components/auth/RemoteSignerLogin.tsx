/**
 * Remote Signer Login Component
 * YakiHonne-style UI for bunker URL connection flow
 * Provides copy/paste interface with clear instructions
 */

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Copy, 
  Check, 
  ArrowLeft, 
  Smartphone, 
  Loader2, 
  AlertTriangle,
  CheckCircle
} from 'lucide-react'

interface RemoteSignerLoginProps {
  onSuccess: (pubkey: string) => void
  onCancel: () => void
}

type ConnectionState = 'idle' | 'generating' | 'waiting' | 'connected' | 'error'

export default function RemoteSignerLogin({ onSuccess, onCancel }: RemoteSignerLoginProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [bunkerUrl, setBunkerUrl] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState<boolean>(false)

  // Generate bunker URL when component mounts
  useEffect(() => {
    generateBunkerUrl()
  }, [])

  const generateBunkerUrl = async () => {
    try {
      setConnectionState('generating')
      setError('')
      
      console.log('[RemoteSignerLogin] 🚀 Generating bunker URL...')
      
      const { startBunkerUrlFlow } = await import('@/lib/auth/unified-remote-signer')
      const url = await startBunkerUrlFlow()
      
      setBunkerUrl(url)
      setConnectionState('waiting')
      
      console.log('[RemoteSignerLogin] ✅ Bunker URL generated:', url)
      
      // Listen for connection
      listenForConnection()
      
    } catch (error) {
      console.error('[RemoteSignerLogin] ❌ Failed to generate bunker URL:', error)
      setError(error.message || 'Failed to generate connection URL')
      setConnectionState('error')
    }
  }

  const listenForConnection = async () => {
    try {
      const { remoteSigner } = await import('@/lib/auth/unified-remote-signer')
      
      // Listen for state changes
      const handleStateChange = (state: { status: string; error?: string }) => {
        console.log('[RemoteSignerLogin] 📊 State changed:', state)
        
        if (state.status === 'connected') {
          setConnectionState('connected')
          
          // Get public key and call success callback
          remoteSigner.getPublicKey().then((pubkey) => {
            console.log('[RemoteSignerLogin] ✅ Connection successful, pubkey:', pubkey)
            onSuccess(pubkey)
          }).catch((error) => {
            console.error('[RemoteSignerLogin] ❌ Failed to get public key:', error)
            setError('Connection successful but failed to get public key')
            setConnectionState('error')
          })
        } else if (state.status === 'error') {
          setError(state.error || 'Connection failed')
          setConnectionState('error')
        }
      }
      
      remoteSigner.onStateChange(handleStateChange)
      
    } catch (error) {
      console.error('[RemoteSignerLogin] ❌ Failed to listen for connection:', error)
      setError('Failed to listen for connection')
      setConnectionState('error')
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(bunkerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('[RemoteSignerLogin] ❌ Failed to copy:', error)
    }
  }

  const retryConnection = () => {
    setError('')
    setConnectionState('idle')
    generateBunkerUrl()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Connect Remote Signer
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Use your mobile Nostr app to sign in securely
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          
          {/* Connection State Display */}
          {connectionState === 'generating' && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600 dark:text-gray-300">
                Generating connection URL...
              </p>
            </div>
          )}

          {connectionState === 'waiting' && bunkerUrl && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  📱 Connection Steps:
                </h3>
                <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                  <li>Copy the connection URL below</li>
                  <li>Open nsec.app on your mobile device</li>
                  <li>Paste the URL and approve the connection</li>
                  <li>Return to this page</li>
                </ol>
              </div>

              {/* Bunker URL Display */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Connection URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bunkerUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                  />
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {copied && (
                  <p className="text-sm text-green-600 text-center">
                    ✅ Copied to clipboard!
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Waiting for connection...</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  You have 5 minutes to complete the connection
                </p>
              </div>
            </div>
          )}

          {connectionState === 'connected' && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Connected Successfully!
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Redirecting to your journal...
              </p>
            </div>
          )}

          {connectionState === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Connection Failed
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {error}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={retryConnection}
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Back Button */}
          {connectionState !== 'connected' && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                onClick={onCancel}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login Options
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Need help? Make sure you have nsec.app installed on your mobile device.
          </p>
        </div>
      </div>
    </div>
  )
}
