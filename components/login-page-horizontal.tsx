'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Check, 
  CheckCircle, 
  Copy, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Key, 
  Loader2, 
  Plus, 
  Radio, 
  Smartphone, 
  User,
  AlertTriangle
} from 'lucide-react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import { QRCodeSVG } from 'qrcode.react'
import { Logo } from './logo'
import { Nip46RemoteSigner } from 'nostr-signer-connector'

interface LoginPageHorizontalProps {
  onLoginSuccess: (data: any) => void
}

interface GeneratedKeys {
  pubkey: string
  nsec: string
  privateKey: string
  npub: string
}

export default function LoginPageHorizontal({ onLoginSuccess }: LoginPageHorizontalProps) {
  const [currentStep, setCurrentStep] = useState<'choose' | 'method' | 'connect' | 'complete'>('choose')
  const [selectedPath, setSelectedPath] = useState<'existing' | 'new' | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'extension' | 'remote' | 'nsec' | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null)
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false)
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [bunkerUrl, setBunkerUrl] = useState('')
  const [connectUri, setConnectUri] = useState('')
  const [nsecInput, setNsecInput] = useState('')
  const [showNsec, setShowNsec] = useState(false)
  const [remoteSignerMode, setRemoteSignerMode] = useState<'client' | 'signer'>('client')
  const [sessionKeypair, setSessionKeypair] = useState<{
    appSecretKey: Uint8Array
    appPublicKey: string
    secret: string
  } | null>(null)

  const steps = ['choose', 'method', 'connect', 'complete']
  const currentStepIndex = steps.indexOf(currentStep)

  const goNext = () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex] as any)
    }
  }

  const goBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex] as any)
      if (prevIndex <= 1) {
        setSelectedPath(null)
        setSelectedMethod(null)
      }
      
      // Reset all connection states when going back
      setConnectionState('idle')
      setError('')
      setBunkerUrl('')
      setConnectUri('')
      setNsecInput('')
      setRemoteSignerMode('client')
      setSessionKeypair(null)
    }
  }

  const generateNewKeypair = () => {
    const privateKey = generateSecretKey()
    const pubkey = getPublicKey(privateKey)
    const nsec = nip19.nsecEncode(privateKey)
    const privateKeyHex = bytesToHex(privateKey)
    const npub = nip19.npubEncode(pubkey)

    setGeneratedKeys({
      pubkey,
      nsec,
      privateKey: privateKeyHex,
      npub
    })
    goNext()
  }

  const completeAccountCreation = () => {
    if (generatedKeys) {
      onLoginSuccess({
        pubkey: generatedKeys.pubkey,
        nsec: generatedKeys.nsec,
        privateKey: generatedKeys.privateKey,
        authMethod: 'nsec'
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleExtensionLogin = async () => {
    console.log('[Login] 🔄 Starting extension login...')
    resetConnectionStates() // Reset any previous state first
    setConnectionState('connecting')
    try {
      if (!window.nostr) {
        throw new Error('Nostr extension not found')
      }
      const pubkey = await window.nostr.getPublicKey()
      console.log('[Login] 🔑 Extension Login - Pubkey:', pubkey)
      
      onLoginSuccess({
        pubkey,
        authMethod: 'extension'
      })
    } catch (err: any) {
      setConnectionState('error')
      setError(err.message || 'Failed to connect extension')
    }
  }

  const handleNsecLogin = async () => {
    console.log('[Login] 🔄 Starting nsec login...')
    resetConnectionStates() // Reset any previous state first
    setConnectionState('connecting')
    try {
      const { getPublicKey } = await import("nostr-tools/pure")
      const { bytesToHex } = await import("@noble/hashes/utils")
      const { decode } = await import('nostr-tools/nip19')

      let privateKeyBytes: Uint8Array
      if (nsecInput.startsWith("nsec1")) {
        const { data } = decode(nsecInput)
        privateKeyBytes = data as Uint8Array
      } else {
        privateKeyBytes = new Uint8Array(nsecInput.match(/.{1,2}/g)?.map(byte => Number.parseInt(byte, 16)) || [])
      }

      const pubkey = getPublicKey(privateKeyBytes)
      const privateKeyHex = bytesToHex(privateKeyBytes)

      console.log('[Login] 🔑 NSEC Login - Derived pubkey:', pubkey)
      console.log('[Login] 🔑 NSEC Login - Private key hex:', privateKeyHex.substring(0, 10) + '...')

      onLoginSuccess({
        pubkey,
        privateKey: privateKeyHex,
        authMethod: 'nsec'
      })
    } catch (err: any) {
      setConnectionState('error')
      setError(err.message || 'Failed to import key')
    }
  }

  const resetConnectionStates = () => {
    console.log('[Login] 🔄 Resetting connection states...')
    setConnectionState('idle')
    setError('')
    setBunkerUrl('')
    setConnectUri('')
    setNsecInput('')
    setRemoteSignerMode('client')
    setSessionKeypair(null)
    console.log('[Login] ✅ Connection states reset to idle')
  }

  const handleRemoteSignerClick = () => {
    setSelectedMethod('remote')
    resetConnectionStates()
    goNext()
  }


  const handleBunkerConnect = async () => {
    if (remoteSignerMode === 'signer' && !bunkerUrl) return

    console.log('[Login] 🔄 Starting bunker connect...')
    resetConnectionStates() // Reset any previous state first
    setConnectionState('connecting')
    setError('')

    try {
      if (remoteSignerMode === 'signer') {
        // ============ SIGNER-INITIATED FLOW (Paste bunker:// URL) ============
        console.log('[Login] Signer-initiated: Connecting with bunker URL...')
        
        const input = bunkerUrl.trim()
        
        if (!input) {
          throw new Error('Please enter a bunker URL')
        }
        
        if (!input.startsWith('bunker://')) {
          throw new Error('Invalid bunker URL. Must start with bunker://')
        }
        
        // Use the correct API from signer-connector
        const { connectNip46, setActiveSigner } = await import('@/lib/signer-connector')
        const result = await connectNip46(input)
        
        if (!result.success || !result.signer || !result.session) {
          throw new Error(result.error || 'Failed to connect')
        }
        
        console.log('[Login] ✅ Signer-initiated connection successful')
        
        // Get user pubkey
        const userPubkey = await result.signer.getPublicKey()
        console.log('[Login] 🔑 Remote Signer Login (Bunker) - User pubkey:', userPubkey)
        
        // Set active signer
        setActiveSigner(result.signer)
        
        // Store session for reconnection
        const sessionData = result.session
        localStorage.setItem('nostr_remote_session', JSON.stringify(sessionData))
        
        setConnectionState('success')
        
        // Extract required fields for main app validation
        const clientSecretKey = sessionData.sessionKey // This is the session key from NIP-46
        const bunkerPubkey = sessionData.remotePubkey // This is the remote signer's pubkey
        
        console.log('[Login] Session data fields:', {
          sessionKey: clientSecretKey,
          remotePubkey: bunkerPubkey,
          relayUrls: sessionData.relayUrls
        })
        
        // Create auth data with all required fields
        const authData = {
          pubkey: userPubkey,
          authMethod: 'remote' as const,
          bunkerUri: input,
          relays: sessionData.relayUrls || ['wss://relay.damus.io', 'wss://nos.lol'],
          sessionData: sessionData,
          clientSecretKey: clientSecretKey, // Required by main app validation
          bunkerPubkey: bunkerPubkey // Required by main app validation
        }
        
        console.log('[Login] ✅ Bunker connection successful!')
        console.log('[Login] Auth data being passed to main app:', {
          pubkey: authData.pubkey,
          authMethod: authData.authMethod,
          bunkerUri: authData.bunkerUri,
          relays: authData.relays,
          hasSessionData: !!authData.sessionData
        })
        
        try {
          onLoginSuccess(authData)
          console.log('[Login] ✅ onLoginSuccess called successfully')
        } catch (error) {
          console.error('[Login] ❌ Error calling onLoginSuccess:', error)
          throw error
        }

      } else {
        // ============ CLIENT-INITIATED FLOW (Generate QR Code) ============
        console.log('[Login] Client-initiated: Generating nostrconnect URI...')
        
        const clientMetadata = {
          name: 'Nostr Journal',
          description: 'Private journaling on Nostr'
          // Removed url to avoid potential encoding issues
        }

        // Use multiple relays for better compatibility
        const relays = [
          'wss://relay.damus.io',
          'wss://nos.lol', 
          'wss://relay.snort.social'
        ]
        
        // Import and use the correct API
        const { startClientInitiatedFlow, setActiveSigner } = await import('@/lib/signer-connector')
        
        // Start listening for connection
        const { connectUri, established } = startClientInitiatedFlow(relays, clientMetadata)
        
        console.log('[Login] Generated nostrconnect URI:', connectUri)
        setConnectUri(connectUri)
        
        // Wait for connection with better timeout handling
        console.log('[Login] Waiting for remote signer to scan and connect...')
        console.log('[Login] Promise state:', established)
        
        console.log('[Login] 🔍 About to await established promise...')
        console.log('[Login] 🔍 Promise state:', established)
        
        // Add a manual timeout to provide better error handling
        const connectionTimeout = setTimeout(() => {
          console.log('[Login] ⏰ Manual timeout reached (5 minutes)')
          console.log('[Login] 🔍 Debugging info:')
          console.log('[Login] - Connection state:', connectionState)
          console.log('[Login] - Connect URI:', connectUri)
          console.log('[Login] - Promise state:', established)
          
          setConnectionState('error')
          setError('Connection timeout after 5 minutes. The remote signer may not be responding properly.\n\nTroubleshooting steps:\n1. Make sure your signing app (nsec.app) is open and connected to the internet\n2. Try the bunker:// URL method instead (often more reliable)\n3. Check that you scanned the QR code correctly\n4. Try refreshing and generating a new QR code\n5. Check browser console for detailed error logs')
        }, 300000) // 5 minutes
        
        const { signer, session } = await established.then(
          (result) => {
            clearTimeout(connectionTimeout)
            console.log('[Login] ✅ Client-initiated connection successful')
            console.log('[Login] Signer:', result.signer)
            console.log('[Login] Session:', result.session)
            console.log('[Login] Session type check:', {
              hasSessionKey: !!result.session?.sessionKey,
              hasRemotePubkey: !!result.session?.remotePubkey,
              hasRelayUrls: !!result.session?.relayUrls
            })
            return result
          },
          (error) => {
            clearTimeout(connectionTimeout)
            console.error('[Login] ❌ Connection promise rejected:', error)
            console.error('[Login] ❌ Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            })
            throw error
          }
        )
        
        // Get user pubkey
        const userPubkey = await signer.getPublicKey()
        console.log('[Login] 🔑 Remote Signer Login (QR) - User pubkey:', userPubkey)
        
        // Set active signer
        setActiveSigner(signer)
        
        // Store session for reconnection
        localStorage.setItem('nostr_remote_session', JSON.stringify(session))
        
        setConnectionState('success')
        
        // Extract required fields for main app validation
        const clientSecretKey = session.sessionKey // This is the session key from NIP-46
        const bunkerPubkey = session.remotePubkey // This is the remote signer's pubkey
        
        console.log('[Login] Session data fields:', {
          sessionKey: clientSecretKey,
          remotePubkey: bunkerPubkey,
          relayUrls: session.relayUrls
        })
        
        // Create auth data with all required fields
        const authData = {
          pubkey: userPubkey,
          authMethod: 'remote' as const,
          bunkerUri: connectUri,
          relays: session.relayUrls || relays,
          sessionData: session,
          clientSecretKey: clientSecretKey, // Required by main app validation
          bunkerPubkey: bunkerPubkey // Required by main app validation
        }
        
        onLoginSuccess(authData)
      }

    } catch (error: any) {
      console.error('[Login] Connection failed:', error)
      setConnectionState('error')
      
      let errorMsg = 'Failed to connect to remote signer'
      if (error.message.includes('timeout')) {
        errorMsg = 'Connection timeout after 5 minutes. Please try:\n\n1. Scan the QR code with your Nostr app (nsec.app, Damus, etc.)\n2. Make sure to approve the connection in your app\n3. Try the bunker:// URL method instead (often more reliable)\n4. Check that both devices have internet connection'
      } else if (error.message.includes('rejected')) {
        errorMsg = 'Connection rejected by your signing app. Please try again.'
      } else if (error.message.includes('Invalid URL')) {
        errorMsg = error.message
      } else {
        errorMsg = error.message || 'Failed to connect'
      }
      
      setError(errorMsg)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'choose':
        return (
          <div className="space-y-8">
            <div className="text-center">
              <Logo className="h-24 w-auto mx-auto mb-8" />
              <h2 className="text-3xl font-bold text-foreground mb-2">Welcome to Nostr Journal</h2>
              <p className="text-muted-foreground">Your private, decentralized note-taking app</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 max-w-2xl mx-auto">
              <button
                onClick={() => {
                  setSelectedPath('existing')
                  goNext()
                }}
                className="p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <User className="w-6 h-6 text-primary" />
                  <h3 className="font-semibold">Use Existing Nostr Account</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect with browser extension, remote signer, or import your key
                </p>
              </button>
              <button
                onClick={() => {
                  setSelectedPath('new')
                  goNext()
                }}
                className="p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Plus className="w-6 h-6 text-primary" />
                  <h3 className="font-semibold">Create New Nostr Account</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generate a new cryptographic key pair for secure note-taking
                </p>
              </button>
            </div>
            <div className="text-center">
              <button
                onClick={() => setShowInfo(true)}
                className="text-primary hover:underline text-sm flex items-center gap-2 mx-auto"
              >
                <HelpCircle className="w-4 h-4" />
                What is Nostr?
              </button>
            </div>
          </div>
        )

      case 'method':
        if (selectedPath === 'new') {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Create Your Account</h2>
                <p className="text-muted-foreground">We'll generate a new cryptographic key pair for you</p>
              </div>
              <div className="max-w-md mx-auto">
                <button
                  onClick={generateNewKeypair}
                  className="w-full p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Key className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Generate My Keys</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create a new Nostr key pair for your journal
                  </p>
                </button>
              </div>
            </div>
          )
        } else {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Choose Sign-in Method</h2>
                <p className="text-muted-foreground">How would you like to connect your Nostr account?</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-2xl mx-auto">
                <button
                  onClick={() => {
                    setSelectedMethod('extension')
                    resetConnectionStates()
                    goNext()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Radio className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Browser Extension</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect with Alby, nos2x, or other Nostr extensions
                  </p>
                </button>
                <button
                  onClick={() => {
                    handleRemoteSignerClick()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Smartphone className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Remote Signer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect with nsec.app, Amber, or other apps
                  </p>
                </button>
                <button
                  onClick={() => {
                    setSelectedMethod('nsec')
                    resetConnectionStates()
                    goNext()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Key className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Import Key</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter your private key directly
                  </p>
                </button>
              </div>

            </div>
          )
        }

      case 'connect':
        if (selectedPath === 'new' && generatedKeys) {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Save Your Keys</h2>
                <p className="text-muted-foreground">Important: Save these keys securely</p>
              </div>
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="p-6 border-2 border-green-500 rounded-lg bg-card">
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <CheckCircle className="w-5 h-5" />
                    <h3 className="font-semibold">Keys Generated Successfully!</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Your Public Key (npub)</label>
                      <div className="flex gap-2">
                        <input
                          value={generatedKeys.npub}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-muted text-muted-foreground"
                        />
                        <Button
                          onClick={() => copyToClipboard(generatedKeys.npub)}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Your Private Key (nsec)</label>
                      <div className="flex gap-2">
                        <input
                          value={generatedKeys.nsec}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-muted text-muted-foreground"
                        />
                        <Button
                          onClick={() => copyToClipboard(generatedKeys.nsec)}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setHasConfirmedSave(!hasConfirmedSave)}
                      className="mt-1 w-5 h-5 flex items-center justify-center border-2 border-muted-foreground rounded-sm hover:border-primary"
                    >
                      {hasConfirmedSave && (
                        <CheckCircle className="w-3 h-3 text-primary" />
                      )}
                    </button>
                    <label 
                      onClick={() => setHasConfirmedSave(!hasConfirmedSave)}
                      className="text-sm cursor-pointer"
                    >
                      I have saved my private key (nsec) in a secure location
                    </label>
                  </div>
                  <Button
                    onClick={completeAccountCreation}
                    disabled={!hasConfirmedSave}
                    className="w-full bg-primary mt-4"
                    size="lg"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Continue to Journal
                  </Button>
                </div>
              </div>
            </div>
          )
        }

        if (selectedPath === 'existing' && selectedMethod) {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  {selectedMethod === 'extension' && 'Connect Extension'}
                  {selectedMethod === 'remote' && 'Connect Remote Signer'}
                  {selectedMethod === 'nsec' && 'Import Private Key'}
                </h2>
                <p className="text-muted-foreground">Complete your connection</p>
              </div>
              <div className="max-w-md mx-auto">
                {selectedMethod === 'extension' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Connect with your Nostr browser extension (Alby, nos2x, etc.)
                    </p>
                    <Button 
                      onClick={handleExtensionLogin}
                      disabled={connectionState === 'connecting'}
                      className="w-full bg-primary hover:bg-primary/90"
                      size="lg"
                    >
                      {connectionState === 'connecting' ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Radio className="w-5 h-5 mr-2" />
                          Connect Extension
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {selectedMethod === 'remote' && (
                  <div className="space-y-4">
                    {/* Connection Mode Selection */}
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={remoteSignerMode === 'client' ? 'default' : 'outline'}
                        onClick={() => setRemoteSignerMode('client')}
                        className="flex-1"
                      >
                        Generate QR Code
                      </Button>
                      <Button
                        variant={remoteSignerMode === 'signer' ? 'default' : 'outline'}
                        onClick={() => setRemoteSignerMode('signer')}
                        className="flex-1"
                      >
                        Paste Bunker URL
                      </Button>
                    </div>

                    {remoteSignerMode === 'client' ? (
                      /* Client-initiated flow: Generate nostrconnect:// URI */
                      <div className="space-y-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-4">
                            Scan with nsec.app, Alby, or Amethyst to connect
                          </p>
                        </div>
                        {connectUri ? (
                          <div className="flex flex-col items-center space-y-4">
                            <div className="w-64 h-64 bg-white rounded-xl flex items-center justify-center p-6 shadow-lg">
                        <QRCodeSVG 
                                value={connectUri} 
                                size={240} 
                                level="L"
                          includeMargin={true}
                        />
                      </div>
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">
                                Scan with your signing app or copy the connection string below
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <Button
                              onClick={handleBunkerConnect}
                              disabled={connectionState === 'connecting'}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {connectionState === 'connecting' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              Generate Connection
                            </Button>
                          </div>
                        )}
                        
                        {connectUri && (
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">
                              Or copy connection string:
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={connectUri}
                                readOnly
                                className="flex-1 px-3 py-2 border rounded-md bg-background text-foreground text-xs font-mono"
                              />
                              <Button
                                onClick={() => {
                                  navigator.clipboard.writeText(connectUri)
                                  // Show feedback
                                  const button = document.querySelector('[data-copy-button]') as HTMLButtonElement
                                  if (button) {
                                    const originalText = button.innerHTML
                                    button.innerHTML = '<Check className="h-4 w-4" />'
                                    setTimeout(() => {
                                      button.innerHTML = originalText
                                    }, 2000)
                                  }
                                }}
                                variant="outline"
                                size="sm"
                                data-copy-button
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                              <p className="text-xs text-blue-700 dark:text-blue-300">
                                <strong>Instructions:</strong>
                              </p>
                              <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside mt-1">
                                <li>Scan QR code or copy connection string</li>
                                <li>Open your signing app (nsec.app, Alby, etc.)</li>
                                <li>Paste the connection string if scanning fails</li>
                                <li>Return to this app and approve the connection</li>
                              </ol>
                            </div>
                            
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Signer-initiated flow: User pastes bunker:// URL */
                      <div className="space-y-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-4">
                            Paste the bunker:// URL from your signing app
                          </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                            Bunker URL:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={bunkerUrl}
                          onChange={(e) => setBunkerUrl(e.target.value)}
                              placeholder="bunker://...?relay=...&secret=..."
                              className="flex-1 px-3 py-2 border rounded-md bg-background text-foreground font-mono text-sm"
                        />
                        <Button
                          onClick={handleBunkerConnect}
                          disabled={!bunkerUrl || connectionState === 'connecting'}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          {connectionState === 'connecting' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </div>
                    </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-2">
                            <strong>How to get your bunker URL:</strong>
                          </p>
                          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                            <li>Open nsec.app on your device</li>
                            <li>Go to "Connections" or "Apps"</li>
                            <li>Create new connection</li>
                            <li>Copy the bunker:// URL</li>
                            <li>Paste it above and click Connect</li>
                            <li>Return to nsec.app to approve the connection</li>
                          </ol>
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>💡 Tip:</strong> The bunker:// method is often more reliable than QR codes for initial connections.
                            </p>
                          </div>
                        </div>
                        
                      </div>
                    )}

                    {/* Connection Status */}
                    {connectionState === 'connecting' && (
                      <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Connecting...</span>
                      </div>
                    )}
                    {connectionState === 'success' && (
                      <div className="flex items-center justify-center space-x-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Connected successfully!</span>
                      </div>
                    )}
                    {connectionState === 'error' && (
                      <div className="space-y-3">
                      <div className="flex items-center justify-center space-x-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setConnectionState('idle')
                              setError('')
                              if (remoteSignerMode === 'client') {
                                setConnectUri('')
                              } else {
                                setBunkerUrl('')
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            Try Again
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedMethod === 'nsec' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Enter your private key (nsec format or hex)
                    </p>
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={showNsec ? "text" : "password"}
                          placeholder="nsec1..."
                          value={nsecInput}
                          onChange={(e) => setNsecInput(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md bg-background text-foreground pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNsec(!showNsec)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showNsec ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button 
                        onClick={handleNsecLogin}
                        disabled={!nsecInput || connectionState === 'connecting'}
                        className="w-full bg-primary hover:bg-primary/90"
                        size="lg"
                      >
                        {connectionState === 'connecting' ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Key className="w-5 h-5 mr-2" />
                            Import Key
                          </>
                        )}
                      </Button>
                      {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        }

        return (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-foreground mb-2">Connecting...</h2>
              <p className="text-muted-foreground">Please wait while we set up your connection</p>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="space-y-8 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2">Welcome to Nostr Journal!</h2>
              <p className="text-muted-foreground">Redirecting to your journal...</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="bg-card rounded-xl border p-4 sm:p-8 min-h-[400px] sm:min-h-[500px] relative overflow-hidden flex flex-col justify-center">
          <div className="slide-content w-full">
            {renderStepContent()}
          </div>
        </div>
        
        <div className="flex justify-center mt-8">
          <Button
            onClick={goBack}
            variant="ghost"
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}
