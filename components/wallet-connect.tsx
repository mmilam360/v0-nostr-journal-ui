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
