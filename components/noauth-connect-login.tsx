"use client"

import { useEffect, useRef, useState } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { noauthSignerManager } from "@/lib/noauth-signer-manager"

interface NoauthConnectLoginProps {
  onLoginSuccess: (data: any) => void
  onBack: () => void
}

export default function NoauthConnectLogin({ onLoginSuccess, onBack }: NoauthConnectLoginProps) {
  const widgetRef = useRef<any>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) return

    const handleConnect = (e: any) => {
      console.log('[NoauthConnect] Connected:', e.detail)
      const { bunkerUrl, pubkey } = e.detail
      
      // Set up the noauth signer manager
      noauthSignerManager.setWidget(widget)
      noauthSignerManager.setConnected(pubkey)
      
      // Create auth data in the format expected by main app
      const authData = {
        pubkey,
        authMethod: "noauth" as const, // New auth method for noauth-connect
        bunkerUri: bunkerUrl,
        // The noauth-connect widget handles session persistence automatically
        // We don't need to manage session data manually
      }
      
      onLoginSuccess(authData)
    }

    const handleDisconnect = () => {
      console.log('[NoauthConnect] Disconnected')
      noauthSignerManager.setDisconnected()
      setIsConnecting(false)
    }

    const handleError = (e: any) => {
      console.error('[NoauthConnect] Error:', e.detail)
      setError(e.detail.message || 'Connection failed')
      setIsConnecting(false)
    }

    const handleReady = () => {
      console.log('[NoauthConnect] Widget ready')
    }

    widget.addEventListener('noauth-connected', handleConnect)
    widget.addEventListener('noauth-disconnected', handleDisconnect)
    widget.addEventListener('noauth-error', handleError)
    widget.addEventListener('noauth-ready', handleReady)

    return () => {
      widget.removeEventListener('noauth-connected', handleConnect)
      widget.removeEventListener('noauth-disconnected', handleDisconnect)
      widget.removeEventListener('noauth-error', handleError)
      widget.removeEventListener('noauth-ready', handleReady)
    }
  }, [onLoginSuccess])

  const handleConnect = () => {
    if (widgetRef.current) {
      setIsConnecting(true)
      setError('')
      widgetRef.current.open()
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6 text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Main Content */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Connect with Noauth
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Use your Noauth account to sign in securely
            </p>
          </div>

          {/* Noauth Connect Widget */}
          <div className="mb-6">
            <noauth-connect
              ref={widgetRef}
              app-name="Nostr Journal"
              app-url="https://nostrjournal.com"
              permissions="sign_event:30001,sign_event:5,nip04_encrypt,nip04_decrypt"
              button-text="Connect with Noauth"
              button-color="#7c3aed"
              button-text-color="#ffffff"
              theme="dark"
            />
          </div>

          {/* Manual Connect Button */}
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Connecting...
              </>
            ) : (
              'Connect with Noauth'
            )}
          </Button>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This will connect to use.nsec.app for secure authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
