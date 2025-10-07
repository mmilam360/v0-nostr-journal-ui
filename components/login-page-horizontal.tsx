'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Smartphone, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  HelpCircle,
  Copy,
  CheckCircle,
  AlertTriangle,
  Key,
  Radio,
  Settings,
  Loader2,
  QrCode,
  Link2,
  Eye,
  EyeOff,
  Check
} from 'lucide-react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import { QRCodeSVG } from 'qrcode.react'
import InfoModal from './info-modal'
import { Logo } from './logo'

interface LoginPageHorizontalProps {
  onLoginSuccess: (authData: any) => void
}

interface GeneratedKeys {
  secretKey: Uint8Array
  publicKey: string
  nsec: string
  npub: string
}

type LoginStep = 'choose' | 'method' | 'connect' | 'complete'
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"
type RemoteSignerMode = "select" | "bunker" | "nostrconnect"

export default function LoginPageHorizontal({ onLoginSuccess }: LoginPageHorizontalProps) {
  const [currentStep, setCurrentStep] = useState<LoginStep>('choose')
  const [selectedPath, setSelectedPath] = useState<'existing' | 'new' | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'extension' | 'remote' | 'nsec' | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null)
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false)
  
  // Login functionality states
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [error, setError] = useState<string>("")
  const [remoteSignerMode, setRemoteSignerMode] = useState<RemoteSignerMode>("select")
  const [bunkerUrl, setBunkerUrl] = useState<string>("")
  const [nostrconnectInput, setNostrconnectInput] = useState<string>("")
  const [nsecInput, setNsecInput] = useState<string>("")
  const [showNsec, setShowNsec] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const steps: LoginStep[] = ['choose', 'method', 'connect', 'complete']
  const currentStepIndex = steps.indexOf(currentStep)

  // Navigation functions
  const goNext = () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex])
    }
  }

  const goBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex])
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 'choose':
        return selectedPath !== null
      case 'method':
        return selectedPath === 'new' || selectedMethod !== null
      case 'connect':
        return true // This step handles the actual connection
      case 'complete':
        return true
      default:
        return false
    }
  }

  const generateNewKeypair = () => {
    const secretKey = generateSecretKey()
    const publicKey = getPublicKey(secretKey)
    const nsec = nip19.nsecEncode(secretKey)
    const npub = nip19.npubEncode(publicKey)

    setGeneratedKeys({
      secretKey,
      publicKey,
      nsec,
      npub
    })
  }

  const completeAccountCreation = () => {
    if (!generatedKeys) return

    onLoginSuccess({
      pubkey: generatedKeys.publicKey,
      authMethod: "nsec",
      privateKey: bytesToHex(generatedKeys.secretKey),
      nsec: generatedKeys.nsec
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Extension login function
  const handleExtensionLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      if (!window.nostr) {
        throw new Error("No Nostr extension found. Please install Alby or nos2x.")
      }

      const pubkey = await window.nostr.getPublicKey()
      
      onLoginSuccess({
        pubkey,
        authMethod: "extension",
        privateKey: null
      })
    } catch (err: any) {
      console.error("Extension login failed:", err)
      setError(err.message || "Extension login failed")
      setConnectionState("error")
    }
  }

  // Nsec login function
  const handleNsecLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      const { getPublicKey, nip19 } = await import("nostr-tools/pure")
      const { bytesToHex } = await import("@noble/hashes/utils")

      let privateKey: Uint8Array
      let privateKeyHex: string

      if (nsecInput.startsWith("nsec1")) {
        const { type, data } = nip19.decode(nsecInput)
        if (type !== "nsec") throw new Error("Invalid nsec format")
        privateKey = data as Uint8Array
      } else {
        // Assume it's hex
        privateKey = new Uint8Array(Buffer.from(nsecInput, "hex"))
      }

      privateKeyHex = bytesToHex(privateKey)
      const pubkey = getPublicKey(privateKey)

      onLoginSuccess({
        pubkey,
        authMethod: "nsec",
        privateKey: privateKeyHex,
        nsec: nsecInput
      })
    } catch (err: any) {
      console.error("Nsec login failed:", err)
      setError(err.message || "Invalid private key")
      setConnectionState("error")
    }
  }

  // Remote signer login function
  const startBunkerLogin = async () => {
    setRemoteSignerMode("bunker")
    setConnectionState("generating")
    setError("")

    try {
      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
      
      const clientSecretKey = generateSecretKey()
      const clientPublicKey = getPublicKey(clientSecretKey)
      
      const secret = bytesToHex(clientSecretKey)
      const appName = "Nostr Journal"
      const appPublicKey = clientPublicKey
      const perms = "read,write"
      const BUNKER_RELAY = "wss://relay.nsec.app"
      
      const bunkerURI = `nostrconnect://${appPublicKey}?relay=${encodeURIComponent(BUNKER_RELAY)}&secret=${secret}&name=${appName}&perms=${perms}`
      
      setBunkerUrl(bunkerURI)
      setConnectionState("waiting")
      
    } catch (err: any) {
      console.error("Bunker login failed:", err)
      setError(err.message || "Failed to generate connection")
      setConnectionState("error")
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'choose':
        return (
          <div className="space-y-8">
            <div className="text-center">
              <Logo className="h-20 w-auto mx-auto mb-6" />
              <h1 className="text-4xl font-bold text-foreground mb-2">Welcome to Nostr Journal</h1>
              <p className="text-muted-foreground text-lg">Your private, decentralized journal</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Use Existing Account */}
              <button
                onClick={() => {
                  setSelectedPath('existing')
                  goNext()
                }}
                className="p-8 rounded-xl border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Use Existing Account</h3>
                    <p className="text-muted-foreground">Sign in with your Nostr keys</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect with browser extension, remote signer, or import your private key
                </p>
              </button>

              {/* Create New Account */}
              <button
                onClick={() => {
                  setSelectedPath('new')
                  goNext()
                }}
                className="p-8 rounded-xl border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Create New Account</h3>
                    <p className="text-muted-foreground">Get started in 30 seconds</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generate a new cryptographic key pair for your Nostr identity
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
                <div className="p-6 border-2 border-primary rounded-lg bg-card">
                  <h3 className="font-semibold text-lg mb-4">Generate Your Keys</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    This creates your unique Nostr identity. Your keys are generated locally and never leave your device.
                  </p>

                  <Button
                    onClick={generateNewKeypair}
                    className="w-full bg-primary hover:bg-primary/90"
                    size="lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate My Keys
                  </Button>
                </div>
              </div>
            </div>
          )
        } else {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Choose Sign-In Method</h2>
                <p className="text-muted-foreground">How would you like to connect your account?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Browser Extension */}
                <button
                  onClick={() => {
                    setSelectedMethod('extension')
                    goNext()
                  }}
                  className="p-6 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Radio className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Browser Extension</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use Alby, nos2x, or other Nostr extensions
                  </p>
                </button>

                {/* Remote Signer */}
                <button
                  onClick={() => {
                    setSelectedMethod('remote')
                    goNext()
                  }}
                  className="p-6 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Smartphone className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Remote Signer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect with nsec.app, Amber, or other apps
                  </p>
                </button>

                {/* Import Key */}
                <button
                  onClick={() => {
                    setSelectedMethod('nsec')
                    goNext()
                  }}
                  className="p-6 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80 group"
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
                      <p className="text-xs text-muted-foreground mt-1">
                        Share this - it's like your username
                      </p>
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
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 mt-2">
                        <div className="flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <p className="font-medium text-yellow-800 dark:text-yellow-200">
                              Save this key securely!
                            </p>
                            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                              This is like your password. Anyone with this key can access your account.
                              Save it in a password manager or write it down.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 mt-6">
                    <input
                      type="checkbox"
                      id="saved"
                      checked={hasConfirmedSave}
                      onChange={(e) => setHasConfirmedSave(e.target.checked)}
                      className="mt-1"
                    />
                    <label htmlFor="saved" className="text-sm">
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
        } else if (selectedPath === 'existing' && selectedMethod) {
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
                    {remoteSignerMode === 'select' && (
                      <>
                        <p className="text-sm text-muted-foreground text-center">
                          Connect with a remote Nostr signer app
                        </p>
                        <div className="space-y-3">
                          <Button 
                            onClick={startBunkerLogin}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            <QrCode className="w-5 h-5 mr-2" />
                            Scan QR Code (nsec.app, Amber)
                          </Button>
                          <Button 
                            onClick={() => setRemoteSignerMode('nostrconnect')}
                            variant="outline"
                            className="w-full"
                          >
                            <Link2 className="w-5 h-5 mr-2" />
                            Paste Connection String
                          </Button>
                        </div>
                      </>
                    )}

                    {remoteSignerMode === 'bunker' && connectionState === 'waiting' && bunkerUrl && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          Scan this QR code with your Nostr app
                        </p>
                        <div className="flex justify-center">
                          <QRCodeSVG value={bunkerUrl} size={200} />
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={bunkerUrl}
                            readOnly
                            className="w-full px-3 py-2 text-sm border rounded font-mono bg-background text-foreground"
                          />
                          <Button
                            onClick={() => copyToClipboard(bunkerUrl)}
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Connection String
                          </Button>
                        </div>
                      </div>
                    )}

                    {remoteSignerMode === 'nostrconnect' && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          Paste the connection string from your Nostr app
                        </p>
                        <input
                          type="text"
                          placeholder="nostrconnect://..."
                          value={nostrconnectInput}
                          onChange={(e) => setNostrconnectInput(e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded font-mono bg-background text-foreground placeholder-muted-foreground"
                        />
                        <Button
                          onClick={() => {
                            setError('NostrConnect login not yet implemented')
                          }}
                          disabled={!nostrconnectInput.startsWith('nostrconnect://')}
                          className="w-full"
                        >
                          Connect
                        </Button>
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
                          className="w-full px-3 py-2 pr-10 text-sm border rounded font-mono bg-background text-foreground placeholder-muted-foreground"
                        />
                        <button
                          onClick={() => setShowNsec(!showNsec)}
                          className="absolute right-2 top-2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showNsec ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button 
                        onClick={handleNsecLogin}
                        disabled={connectionState === 'connecting' || !nsecInput.trim()}
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
                            <Key className="w-5 h-5 mr-2" />
                            Import Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}
              </div>
            </div>
          )
        }

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
    <>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center max-w-md mx-auto">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    index <= currentStepIndex 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {index < currentStepIndex ? <Check className="w-5 h-5" /> : index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-20 h-1 mx-2 transition-all ${
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Content Area with Slide Animation */}
          <div className="bg-card rounded-xl border p-8 min-h-[500px] relative overflow-hidden">
            <div className="slide-content">
              {renderStepContent()}
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <Button
              onClick={goBack}
              variant="ghost"
              disabled={currentStepIndex === 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
            
            {currentStep !== 'complete' && (
              <Button
                onClick={goNext}
                disabled={!canProceed()}
                className="flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} onGetStarted={() => {
          setShowInfo(false)
          setSelectedPath('new')
          setCurrentStep('method')
        }} />
      )}
    </>
  )
}
