"use client"

/**
 * DEBUG VERSION - NIP-46 Login with Maximum Logging
 * 
 * This version will show us EXACTLY what's happening
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'
import type { AuthData } from './main-app'

interface NostrEvent {
  id?: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig?: string
}

type LoginMethod = 'idle' | 'extension' | 'remote' | 'nsec'
type ConnectionState = 'idle' | 'generating' | 'waiting' | 'connecting' | 'success' | 'error'

const RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('idle')
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [connectUrl, setConnectUrl] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [nsecInput, setNsecInput] = useState<string>('')
  const [debugLog, setDebugLog] = useState<string[]>([])

  const poolRef = useRef<any>(null)
  const subRef = useRef<any>(null)
  const localSecretRef = useRef<Uint8Array | null>(null)
  const localPubkeyRef = useRef<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const nostrRef = useRef<any>(null)

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    setDebugLog(prev => [...prev, logMessage])
  }

  const containerStyle = {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch' as const,
  }

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (subRef.current) {
      try {
        subRef.current.close()
        addLog('✅ Subscription closed')
      } catch (e) {}
      subRef.current = null
    }
    if (poolRef.current) {
      try {
        poolRef.current.close(RELAYS)
        addLog('✅ Pool closed')
      } catch (e) {}
      poolRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const initNostrTools = useCallback(async () => {
    if (nostrRef.current) {
      addLog('♻️ nostr-tools already loaded')
      return nostrRef.current
    }
    
    try {
      addLog('📦 Loading nostr-tools...')
      const nostr = await import('nostr-tools')
      nostrRef.current = nostr
      addLog('✅ nostr-tools loaded successfully')
      addLog(`Version check - has nip44: ${!!nostr.nip44}`)
      return nostr
    } catch (err) {
      addLog('❌ Failed to load nostr-tools: ' + err)
      throw new Error('Failed to initialize')
    }
  }, [])

  const handleExtensionLogin = async () => {
    setLoginMethod('extension')
    setConnectionState('connecting')
    setError('')

    try {
      if (!window.nostr) {
        throw new Error('No Nostr extension found')
      }

      const pubkey = await window.nostr.getPublicKey()
      addLog('✅ Extension login: ' + pubkey)

      onLoginSuccess({
        pubkey,
        authMethod: 'extension',
      })
    } catch (err) {
      addLog('❌ Extension error: ' + err)
      setConnectionState('error')
      setError(err instanceof Error ? err.message : 'Extension login failed')
    }
  }

  const handleNsecLogin = async () => {
    setConnectionState('connecting')
    setError('')

    try {
      const nostr = await initNostrTools()
      
      let privateKey: Uint8Array

      if (nsecInput.startsWith('nsec1')) {
        const decoded = nostr.nip19.decode(nsecInput)
        if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
        privateKey = decoded.data
      } else if (nsecInput.length === 64) {
        privateKey = nostr.hexToBytes(nsecInput)
      } else {
        throw new Error('Invalid format')
      }

      const pubkey = nostr.getPublicKey(privateKey)
      addLog('✅ Nsec login: ' + pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput,
        authMethod: 'nsec',
      })
    } catch (err) {
      addLog('❌ Nsec error: ' + err)
      setConnectionState('error')
      setError(err instanceof Error ? err.message : 'Invalid key')
    }
  }

  const startRemoteSignerLogin = async () => {
    setLoginMethod('remote')
    setConnectionState('generating')
    setError('')
    setDebugLog([])

    try {
      addLog('🚀 Starting remote signer login')
      const nostr = await initNostrTools()

      // Generate keypair
      addLog('🔑 Generating ephemeral keypair...')
      const localSecret = nostr.generateSecretKey()
      const localPubkey = nostr.getPublicKey(localSecret)

      localSecretRef.current = localSecret
      localPubkeyRef.current = localPubkey

      addLog('✅ Client pubkey: ' + localPubkey)

      // Create URL
      const metadata = {
        name: 'Nostr Journal',
        url: typeof window !== 'undefined' ? window.location.origin : '',
        description: 'Private encrypted journal',
      }

      const encodedMetadata = encodeURIComponent(JSON.stringify(metadata))
      const relayParams = RELAYS.map(r => `relay=${encodeURIComponent(r)}`).join('&')
      const url = `nostrconnect://${localPubkey}?${relayParams}&metadata=${encodedMetadata}`

      addLog('📱 Generated URL: ' + url.substring(0, 50) + '...')
      setConnectUrl(url)
      setConnectionState('waiting')

      // Initialize pool
      addLog('🔌 Initializing relay pool...')
      const pool = new nostr.SimplePool()
      poolRef.current = pool

      const now = Math.floor(Date.now() / 1000)
      addLog(`⏰ Subscribing from timestamp: ${now}`)

      // Subscribe
      addLog('📡 Subscribing to relays: ' + RELAYS.join(', '))
      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [24133],
            '#p': [localPubkey],
            since: now,
          }
        ],
        {
          onevent: (event: NostrEvent) => {
            addLog('📨 ========== EVENT RECEIVED ==========')
            addLog('Event ID: ' + (event.id || 'no id'))
            addLog('From pubkey: ' + event.pubkey)
            addLog('Kind: ' + event.kind)
            addLog('Created: ' + new Date(event.created_at * 1000).toISOString())
            addLog('Tags: ' + JSON.stringify(event.tags))
            addLog('Content length: ' + event.content.length)
            addLog('Content preview: ' + event.content.substring(0, 100))
            addLog('======================================')

            handleSignerEvent(event, nostr)
          },
          oneose: () => {
            addLog('✅ EOSE received - subscription active')
          }
        }
      )

      subRef.current = sub
      addLog('✅ Subscription created')

      // Timeout
      timeoutRef.current = setTimeout(() => {
        if (connectionState !== 'success') {
          addLog('⏱️ TIMEOUT - No connection after 120s')
          setConnectionState('error')
          setError('Timeout - no response from signer')
          cleanup()
        }
      }, 120000)

      addLog('✅ Setup complete - waiting for Nsec.app to connect')

    } catch (err) {
      addLog('❌ Init error: ' + err)
      addLog('Stack: ' + (err instanceof Error ? err.stack : 'no stack'))
      setConnectionState('error')
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    }
  }

  const handleSignerEvent = async (event: NostrEvent, nostr: any) => {
    try {
      addLog('🔍 Processing event...')

      if (!localSecretRef.current || !localPubkeyRef.current) {
        addLog('❌ Keys not initialized!')
        return
      }

      // Check tags
      const pTags = event.tags.filter(tag => tag[0] === 'p')
      addLog('P-tags found: ' + JSON.stringify(pTags))
      
      const isForUs = pTags.some(tag => tag[1] === localPubkeyRef.current)
      addLog('Is for us? ' + isForUs)
      
      if (!isForUs) {
        addLog('⚠️ Event not for us - ignoring')
        return
      }

      addLog('🔓 Attempting decryption...')
      addLog('Using local secret (length): ' + localSecretRef.current.length)
      addLog('Decrypting with signer pubkey: ' + event.pubkey)

      let decrypted: string
      try {
        decrypted = await nostr.nip44.decrypt(
          localSecretRef.current,
          event.pubkey,
          event.content
        )
        addLog('✅ Decryption successful!')
        addLog('Decrypted content: ' + decrypted)
      } catch (decryptErr) {
        addLog('❌ Decryption failed: ' + decryptErr)
        addLog('Error stack: ' + (decryptErr instanceof Error ? decryptErr.stack : 'no stack'))
        return
      }

      let payload: any
      try {
        payload = JSON.parse(decrypted)
        addLog('✅ JSON parse successful')
        addLog('Payload: ' + JSON.stringify(payload, null, 2))
      } catch (parseErr) {
        addLog('❌ JSON parse failed: ' + parseErr)
        return
      }

      // Check payload structure
      addLog('Checking payload structure...')
      addLog('Has method? ' + ('method' in payload))
      addLog('Has id? ' + ('id' in payload))
      addLog('Has result? ' + ('result' in payload))
      addLog('Has error? ' + ('error' in payload))

      if (payload.method === 'connect') {
        addLog('🎯 This is a CONNECT REQUEST!')
        addLog('Request ID: ' + payload.id)
        addLog('Request params: ' + JSON.stringify(payload.params))
        
        addLog('🔄 Setting state to CONNECTING')
        setConnectionState('connecting')

        const userPubkey = event.pubkey
        addLog('👤 User pubkey: ' + userPubkey)

        // Send response
        addLog('📤 Sending connect response...')
        await sendConnectResponse(nostr, event.pubkey, payload.id, userPubkey)

        addLog('✅ ========== SUCCESS ==========')
        addLog('✅ Connection complete!')
        setConnectionState('success')

        setTimeout(() => {
          addLog('🚀 Calling onLoginSuccess callback')
          onLoginSuccess({
            pubkey: userPubkey,
            remotePubkey: event.pubkey,
            authMethod: 'remote',
          })
          cleanup()
        }, 1000)

      } else if (payload.result) {
        addLog('📨 Received result: ' + payload.result)
      } else if (payload.error) {
        addLog('❌ Received error: ' + payload.error)
        setConnectionState('error')
        setError(payload.error)
      } else {
        addLog('⚠️ Unexpected payload structure')
      }

    } catch (err) {
      addLog('❌ Event handling error: ' + err)
      addLog('Stack: ' + (err instanceof Error ? err.stack : 'no stack'))
    }
  }

  const sendConnectResponse = async (
    nostr: any,
    signerPubkey: string,
    requestId: string,
    userPubkey: string
  ) => {
    if (!localSecretRef.current || !localPubkeyRef.current) {
      addLog('❌ Keys not initialized for response!')
      return
    }

    try {
      addLog('📤 ========== SENDING RESPONSE ==========')
      addLog('To: ' + signerPubkey)
      addLog('Request ID: ' + requestId)
      addLog('User pubkey: ' + userPubkey)

      const response = {
        id: requestId,
        result: userPubkey,
      }

      addLog('Response payload: ' + JSON.stringify(response))

      // Encrypt
      addLog('🔐 Encrypting response...')
      const encrypted = await nostr.nip44.encrypt(
        localSecretRef.current,
        signerPubkey,
        JSON.stringify(response)
      )
      addLog('✅ Encrypted (length): ' + encrypted.length)

      // Create event
      const unsignedEvent = {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', signerPubkey]],
        content: encrypted,
        pubkey: localPubkeyRef.current,
      }

      addLog('📝 Created unsigned event')
      addLog('Event structure: ' + JSON.stringify({
        kind: unsignedEvent.kind,
        created_at: unsignedEvent.created_at,
        tags: unsignedEvent.tags,
        pubkey: unsignedEvent.pubkey,
        contentLength: unsignedEvent.content.length
      }))

      // Sign
      addLog('✍️ Signing event...')
      const signedEvent = await nostr.finalizeEvent(unsignedEvent, localSecretRef.current)
      addLog('✅ Event signed')
      addLog('Event ID: ' + signedEvent.id)

      // Publish
      if (!poolRef.current) {
        addLog('❌ Pool not available!')
        return
      }

      addLog('📡 Publishing to relays...')
      try {
        await poolRef.current.publish(RELAYS, signedEvent)
        addLog('✅ RESPONSE PUBLISHED TO RELAYS')
      } catch (pubErr) {
        addLog('⚠️ Publish error: ' + pubErr)
        // Don't throw - publishing can be flaky
      }

      addLog('======================================')

    } catch (err) {
      addLog('❌ Response sending failed: ' + err)
      addLog('Stack: ' + (err instanceof Error ? err.stack : 'no stack'))
      throw err
    }
  }

  const handleBack = () => {
    cleanup()
    setLoginMethod('idle')
    setConnectionState('idle')
    setError('')
    setConnectUrl('')
    setNsecInput('')
    setDebugLog([])
  }

  return (
    <div style={containerStyle} className="bg-slate-900">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Nostr Journal - DEBUG</h1>
            <p className="text-slate-400">Watch the logs below</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Login Card */}
            <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
              
              {loginMethod === 'idle' && (
                <div className="space-y-3">
                  <button
                    onClick={handleExtensionLogin}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <KeyRound className="h-5 w-5" />
                    Extension Login
                  </button>

                  <button
                    onClick={startRemoteSignerLogin}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Remote Signer (DEBUG)
                  </button>

                  <button
                    onClick={() => { setLoginMethod('nsec'); setConnectionState('idle'); }}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Enter Private Key
                  </button>
                </div>
              )}

              {loginMethod === 'extension' && (
                <div className="text-center py-8">
                  {connectionState === 'connecting' && (
                    <>
                      <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
                      <p className="text-slate-300">Connecting to extension...</p>
                    </>
                  )}
                  {connectionState === 'error' && (
                    <>
                      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <p className="text-red-400 mb-4">{error}</p>
                      <button onClick={handleBack} className="text-slate-400 hover:text-white">
                        ← Back
                      </button>
                    </>
                  )}
                </div>
              )}

              {loginMethod === 'nsec' && (
                <div className="space-y-4">
                  <input
                    type="password"
                    value={nsecInput}
                    onChange={(e) => setNsecInput(e.target.value)}
                    placeholder="nsec1... or hex"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
                  />
                  <div className="flex gap-3">
                    <button onClick={handleBack} className="flex-1 bg-slate-700 text-white py-3 rounded-lg">
                      Back
                    </button>
                    <button onClick={handleNsecLogin} className="flex-1 bg-blue-600 text-white py-3 rounded-lg">
                      Login
                    </button>
                  </div>
                </div>
              )}

              {loginMethod === 'remote' && (
                <div className="space-y-6">
                  
                  {connectionState === 'generating' && (
                    <div className="text-center py-8">
                      <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                      <p className="text-slate-300">Generating...</p>
                    </div>
                  )}

                  {connectionState === 'waiting' && connectUrl && (
                    <>
                      <div className="bg-white rounded-lg p-4">
                        <QRCodeSVG value={connectUrl} size={200} level="M" className="mx-auto" />
                      </div>
                      <p className="text-center text-slate-300">Scan with Nsec.app</p>
                      <div className="flex justify-center">
                        <div className="animate-pulse flex space-x-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        </div>
                      </div>
                    </>
                  )}

                  {connectionState === 'connecting' && (
                    <div className="text-center py-8">
                      <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                      <p className="text-slate-300">Completing connection...</p>
                    </div>
                  )}

                  {connectionState === 'success' && (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-slate-300">Success!</p>
                    </div>
                  )}

                  {connectionState === 'error' && (
                    <div className="space-y-4">
                      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                      <button onClick={handleBack} className="w-full bg-slate-700 text-white py-3 rounded-lg">
                        Try Again
                      </button>
                    </div>
                  )}

                  {(connectionState === 'waiting' || connectionState === 'connecting') && (
                    <button onClick={handleBack} className="w-full text-slate-400 hover:text-white text-sm">
                      ← Cancel
                    </button>
                  )}
                </div>
              )}

            </div>

            {/* Debug Log */}
            <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
              <h2 className="text-white font-bold mb-4">Debug Log</h2>
              <div className="bg-slate-900 rounded-lg p-4 h-[500px] overflow-y-auto font-mono text-xs">
                {debugLog.length === 0 ? (
                  <p className="text-slate-500">No logs yet...</p>
                ) : (
                  debugLog.map((log, i) => (
                    <div key={i} className="text-slate-300 mb-1">{log}</div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>
      signEvent: (event: any) => Promise<any>
    }
  }
}
