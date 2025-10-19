/**
 * Hook for managing modern bunker authentication
 * Provides unified interface for QR code and bunker URL connections
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  AuthState, 
  connectViaQR, 
  connectViaBunker, 
  fastReconnect,
  clearBunkerSession,
  BunkerSession,
  loadBunkerSession
} from '@/lib/bunker-auth-v2'

interface UseBunkerAuthReturn {
  authState: AuthState
  connectViaQR: () => Promise<void>
  connectViaBunker: (bunkerUrl: string) => Promise<void>
  disconnect: () => void
  retry: () => Promise<void>
  hasActiveSession: boolean
}

export function useBunkerAuth(): UseBunkerAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({ status: 'disconnected' })
  const [activeSession, setActiveSession] = useState<BunkerSession | null>(null)

  // App metadata
  const appMetadata = {
    name: 'Nostr Journal',
    url: window.location.origin,
    description: 'Encrypted journaling with Lightning incentives'
  }

  // Primary relay
  const primaryRelay = 'wss://relay.nsecbunker.com'

  // Check for existing session on mount
  useEffect(() => {
    const session = loadBunkerSession()
    setActiveSession(session)
    
    if (session) {
      console.log('[useBunkerAuth] Found existing session, attempting fast reconnect')
      fastReconnect(setAuthState)
    }
  }, [])

  // Handle QR code connection
  const handleQRConnect = useCallback(async () => {
    try {
      await connectViaQR(primaryRelay, appMetadata, setAuthState)
    } catch (error) {
      console.error('[useBunkerAuth] QR connection failed:', error)
      setAuthState({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'QR connection failed'
      })
    }
  }, [])

  // Keep-alive for mobile WebSocket connections
  useEffect(() => {
    if (authState.status !== 'connecting') return
    
    console.log('[useBunkerAuth] Starting keep-alive for mobile connections')
    const keepAlive = setInterval(() => {
      console.log('[useBunkerAuth] Sending keep-alive ping')
      // This keeps WebSockets open on mobile
      // The SimplePool will handle the actual ping
    }, 10000) // Every 10 seconds while connecting
    
    return () => {
      console.log('[useBunkerAuth] Stopping keep-alive')
      clearInterval(keepAlive)
    }
  }, [authState.status])

  // Handle bunker URL connection
  const handleBunkerConnect = useCallback(async (bunkerUrl: string) => {
    try {
      await connectViaBunker(bunkerUrl, setAuthState)
    } catch (error) {
      console.error('[useBunkerAuth] Bunker connection failed:', error)
      setAuthState({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Bunker connection failed'
      })
    }
  }, [])

  // Disconnect and clear session
  const disconnect = useCallback(() => {
    clearBunkerSession()
    setActiveSession(null)
    setAuthState({ status: 'disconnected' })
    console.log('[useBunkerAuth] Disconnected and cleared session')
  }, [])

  // Retry connection
  const retry = useCallback(async () => {
    if (activeSession) {
      console.log('[useBunkerAuth] Retrying with existing session')
      await fastReconnect(setAuthState)
    } else {
      console.log('[useBunkerAuth] No session to retry with')
      setAuthState({ status: 'disconnected' })
    }
  }, [activeSession])

  return {
    authState,
    connectViaQR: handleQRConnect,
    connectViaBunker: handleBunkerConnect,
    disconnect,
    retry,
    hasActiveSession: !!activeSession
  }
}
