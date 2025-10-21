'use client'

import { useEffect } from 'react'
import { ClientOnly } from '../client-only'

export function BitcoinConnectProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const initializeBitcoinConnect = async () => {
      try {
        // Import Bitcoin Connect
        const { onConnected } = await import('@getalby/bitcoin-connect')
        
        // Set up WebLN provider on window for compatibility
        onConnected((provider) => {
          console.log('[BitcoinConnectProvider] ✅ Provider connected:', provider)
          window.webln = provider
          // Ensure enabled property is set
          if (window.webln) {
            window.webln.enabled = true
          }
        })
        
        console.log('[BitcoinConnectProvider] ✅ Bitcoin Connect initialized')
      } catch (error) {
        console.error('[BitcoinConnectProvider] ❌ Failed to initialize Bitcoin Connect:', error)
      }
    }
    
    initializeBitcoinConnect()
  }, [])

  return (
    <ClientOnly fallback={<div>{children}</div>}>
      {children}
    </ClientOnly>
  )
}
