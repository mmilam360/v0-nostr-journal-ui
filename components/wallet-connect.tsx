'use client'

import { useBitcoinConnect } from '@getalby/bitcoin-connect-react'
import { useEffect } from 'react'

export function WalletConnect() {
  const { isConnected, provider } = useBitcoinConnect()
  
  useEffect(() => {
    if (isConnected) {
      console.log('[WalletConnect] ✅ Wallet connected')
    }
  }, [isConnected])
  
  return (
    <div className="flex flex-col gap-2">
      {!isConnected ? (
        <div className="text-center">
          <p className="mb-3 text-sm text-gray-600">
            Connect your Lightning wallet to deposit stake
          </p>
          <bc-button />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">✓ Wallet Connected</span>
            <bc-balance />
          </div>
          <button 
            onClick={() => {
              // Disconnect logic if needed
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
