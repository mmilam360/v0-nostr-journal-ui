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
import { MKStacksRemoteSigner } from '@/lib/mkstacks-remote-signer'

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
    setConnectionState('connecting')
    try {
      if (!window.nostr) {
        throw new Error('Nostr extension not found')
      }
      const pubkey = await window.nostr.getPublicKey()
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

  const handleBunkerConnect = async () => {
    if (remoteSignerMode === 'signer' && !bunkerUrl) return

    setConnectionState('connecting')
    setError('')

    try {
      if (remoteSignerMode === 'signer') {
        // Signer-initiated flow: user pastes bunker:// URL from nsec.app
        console.log('[BunkerConnect] 🔌 Connecting with bunker URL...')
        console.log('[BunkerConnect] 📱 User Agent:', navigator.userAgent)
        console.log('[BunkerConnect] 📱 Mobile check:', /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
        
        const remoteSigner = new MKStacksRemoteSigner()
        const { signer, session } = await remoteSigner.connectToRemote(bunkerUrl)
        
        console.log('[BunkerConnect] ✅ Connected! Getting user pubkey...')
        
        // Get the actual user pubkey (not signer pubkey)
        const userPubkey = await signer.getPublicKey()
        
        console.log('[BunkerConnect] 👤 User pubkey:', userPubkey)
        
        // Store session for reconnection
        localStorage.setItem('nostr_connect_session', JSON.stringify(session))
        // Store the signer instance globally
        (window as any).remoteSigner = remoteSigner
        
        setConnectionState('success')
        
        // Convert session to the format expected by main app
        const clientSecretKeyHex = (session as any)?.clientSecretKey ? 
          Array.from((session as any).clientSecretKey as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('') : 
          Array.from(await generateSecretKey()).map((b: number) => b.toString(16).padStart(2, '0')).join('')

        setTimeout(() => {
          onLoginSuccess({
            pubkey: userPubkey,
            authMethod: 'remote',
            bunkerUri: bunkerUrl,
            clientSecretKey: clientSecretKeyHex,
            bunkerPubkey: userPubkey, // This is the user's pubkey, not signer's
            relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://relay.primal.net', 'wss://purplepag.es'],
            // Store session data for nostr-signer-connector
            sessionData: session
          })
        }, 1500)
        
      } else {
        // Client-initiated flow: generate nostrconnect:// URI
        console.log('[BunkerConnect] 🚀 Starting client-initiated connection...')
        
        const clientMetadata = {
          name: 'Nostr Journal',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://nostrjournal.app',
          description: 'Private journaling on Nostr'
        }

        // Use more reliable relays with lower PoW requirements for NIP-46
        // These relays are known to work well with remote signers
        const relays = [
          'wss://relay.damus.io',      // Reliable, low PoW requirements
          'wss://nos.lol',             // Good for NIP-46
          'wss://relay.nostr.band',    // Reliable connection
          'wss://relay.primal.net',    // Fast, reliable
          'wss://purplepag.es'         // Good fallback
        ]

        const remoteSigner = new MKStacksRemoteSigner(relays)
        const connectUri = remoteSigner.generateConnectionUri()
        
        console.log('[BunkerConnect] 📱 Generated connection URI')
        setConnectUri(connectUri)

        // Wait for connection (with longer timeout for mobile)
        const timeout = setTimeout(() => {
          setConnectionState('error')
          setError('Connection timeout. Please approve within 2 minutes. Make sure your signing app is connected to the internet.')
        }, 120000)

        // Wait for remote signer to connect
        const { signer, session } = await remoteSigner.listenForConnection(120000)

        clearTimeout(timeout)

        console.log('[BunkerConnect] ✅ Connected! Getting user pubkey...')

        // Get actual user pubkey
      const userPubkey = await signer.getPublicKey()

        console.log('[BunkerConnect] 👤 User pubkey:', userPubkey)

        // Store session
        localStorage.setItem('nostr_connect_session', JSON.stringify(session))
        // Store the signer instance globally
        (window as any).remoteSigner = remoteSigner

        setConnectionState('success')

        // Convert session to the format expected by main app
        const clientSecretKeyHex = (session as any)?.clientSecretKey ? 
          Array.from((session as any).clientSecretKey as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('') : 
          Array.from(await generateSecretKey()).map((b: number) => b.toString(16).padStart(2, '0')).join('')

      setTimeout(() => {
        onLoginSuccess({
          pubkey: userPubkey,
          authMethod: 'remote',
            bunkerUri: connectUri,
          clientSecretKey: clientSecretKeyHex,
            bunkerPubkey: userPubkey, // This is the user's pubkey, not signer's
            relays: relays,
            // Store session data for nostr-signer-connector
            sessionData: session
        })
      }, 1500)
      }

    } catch (error) {
      console.error('[BunkerConnect] ❌ Connection failed:', error)
      setConnectionState('error')
      
      let errorMsg = 'Failed to connect. '
      
      if (error instanceof Error) {
        console.log('[BunkerConnect] ❌ Error details:', error.message, error.stack)
        
        if (error.message.includes('timeout')) {
          errorMsg += 'Connection timed out. Make sure your signing app is open, connected to the internet, and try again.'
        } else if (error.message.includes('blocked') || error.message.includes('rejected')) {
          errorMsg += 'Relay blocked the connection. Try using a different signing app or check your internet connection.'
        } else if (error.message.includes('pow') || error.message.includes('Proof of Work') || error.message.includes('bits needed')) {
          errorMsg += 'Relay requires Proof of Work. Try using a different signing app with PoW support or use browser extension login instead.'
        } else if (error.message.includes('relay')) {
          errorMsg += 'Could not connect to relay. Check your internet connection and try again.'
        } else if (error.message.includes('NIP-46')) {
          errorMsg += 'NIP-46 connection failed. Make sure your signing app supports remote signing and is connected to the internet.'
        } else if (error.message.includes('Invalid URI') || error.message.includes('bunker://')) {
          errorMsg += 'Invalid bunker URL format. Make sure you copied the complete URL from your signing app.'
        } else if (error.message.includes('WebSocket') || error.message.includes('connection')) {
          errorMsg += 'Connection failed. Check your internet connection and try again.'
        } else {
          errorMsg += error.message
        }
      } else {
        errorMsg += 'Unknown error occurred. Please try again.'
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
                    setSelectedMethod('remote')
                    setRemoteSignerMode('client') // Default to client-initiated
                    setBunkerUrl('')
                    setConnectUri('')
                    goNext()
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
                          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>Tip:</strong> If you get "Proof of Work required" errors, try using a different signing app or use browser extension login instead.
                            </p>
                          </div>
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
                            
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mt-2">
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                <strong>⚠️ Important:</strong> You may need to approve additional permissions in your signing app for creating, editing, and deleting notes. Keep your signing app open for the best experience.
                              </p>
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
                        </div>
                        
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mt-2">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            <strong>⚠️ Important:</strong> You may need to approve additional permissions in your signing app for creating, editing, and deleting notes. Keep your signing app open for the best experience.
                          </p>
                        </div>
                        
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            <strong>💡 Tip:</strong> If you get "Proof of Work required" errors, try using a different signing app or use browser extension login instead.
                          </p>
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
