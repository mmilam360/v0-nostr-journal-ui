'use client'

import { useEffect, useState } from 'react'
import { ClientOnly } from './client-only'

export function WalletConnect() {
  return (
    <ClientOnly fallback={<div className="p-4 text-center">Loading wallet...</div>}>
      <WalletConnectInner />
    </ClientOnly>
  )
}

function WalletConnectInner() {
  const [isConnected, setIsConnected] = useState(false)
  
  useEffect(() => {
    // Check if Bitcoin Connect is available
    if (typeof window !== 'undefined' && window.customElements) {
      // Listen for connection events
      const handleConnected = () => {
        console.log('[WalletConnect] ✅ Wallet connected')
        setIsConnected(true)
      }
      
      const handleDisconnected = () => {
        console.log('[WalletConnect] ❌ Wallet disconnected')
        setIsConnected(false)
      }
      
      // Add event listeners
      document.addEventListener('bc:connected', handleConnected)
      document.addEventListener('bc:disconnected', handleDisconnected)
      
      // Check initial state
      if (window.webln && window.webln.enabled) {
        setIsConnected(true)
      }
      
      return () => {
        document.removeEventListener('bc:connected', handleConnected)
        document.removeEventListener('bc:disconnected', handleDisconnected)
      }
    }
  }, [])
  
  return (
    <div className="flex flex-col gap-2">
      {!isConnected ? (
        <div className="text-center">
          <p className="mb-3 text-sm text-gray-600">
            Connect your Lightning wallet to deposit stake
          </p>
          <div className="bitcoin-connect-button">
            <bc-button />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">✓ Wallet Connected</span>
            <div className="bitcoin-connect-balance">
              <bc-balance />
            </div>
          </div>
          <button 
            onClick={() => {
              // Disconnect logic if needed
              if (window.webln && window.webln.disconnect) {
                window.webln.disconnect()
              }
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Change Wallet
          </button>
        </div>
      )}
    </div>
  )
}
