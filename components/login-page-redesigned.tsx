'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Smartphone, 
  Sparkles, 
  ChevronRight, 
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
  EyeOff
} from 'lucide-react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import { QRCodeSVG } from 'qrcode.react'
import InfoModal from './info-modal'

interface LoginPageRedesignedProps {
  onLoginSuccess: (authData: any) => void
}

interface GeneratedKeys {
  secretKey: Uint8Array
  publicKey: string
  nsec: string
  npub: string
}

type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"
type RemoteSignerMode = "select" | "bunker" | "nostrconnect"

export default function LoginPageRedesigned({ onLoginSuccess }: LoginPageRedesignedProps) {
  const [selectedPath, setSelectedPath] = useState<'existing' | 'new' | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null)
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false)
  const [selectedLoginMethod, setSelectedLoginMethod] = useState<'extension' | 'remote' | 'nsec' | null>(null)
  
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

  const generateNewKeypair = () => {
    const secretKey = generateSecretKey()
    const publicKey = getPublicKey(secretKey)
    
    const nsec = nip19.nsecEncode(secretKey)
    const npub = nip19.npubEncode(publicKey)
    
    setGeneratedKeys({ secretKey, publicKey, nsec, npub })
  }

  const completeAccountCreation = () => {
    if (!generatedKeys) return
    
    // Use the generated keys to login
    onLoginSuccess({
      pubkey: generatedKeys.publicKey,
      authMethod: 'nsec',
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

  // Remote signer login function (simplified version)
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
      
      // For now, we'll just show the QR code and let user manually connect
      // The actual WebSocket connection logic would go here
      
    } catch (err: any) {
      console.error("Bunker login failed:", err)
      setError(err.message || "Failed to generate connection")
      setConnectionState("error")
    }
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          {/* Logo & Tagline */}
          <div className="text-center">
            <img 
              src="/Nostr%20Journal%20Logo.svg" 
              alt="Nostr Journal" 
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-foreground">Nostr Journal</h1>
            <p className="text-muted-foreground mt-2">
              Your private, decentralized journal
            </p>
          </div>

          {/* Option Cards */}
          <div className="space-y-4">
            {/* Existing Account Card */}
            <button
              onClick={() => setSelectedPath('existing')}
              className="w-full p-6 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Smartphone className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">Use Existing Nostr Account</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign in with your Nostr keys
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </button>

            {/* New Account Card */}
            <button
              onClick={() => setSelectedPath('new')}
              className="w-full p-6 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">Create New Nostr Account</h3>
                    <p className="text-sm text-muted-foreground">
                      Get started in 30 seconds
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </button>
          </div>

          {/* Expanded Options */}
          {selectedPath === 'existing' && (
            <div className="space-y-4 animate-fade-in">
              <div className="border border-primary/20 rounded-lg bg-card">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-semibold text-lg">Sign in with Existing Account</h4>
                    <Button 
                      onClick={() => setSelectedPath(null)}
                      variant="ghost" 
                      size="sm"
                    >
                      Back
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Browser Extension */}
                    <button 
                      onClick={() => setSelectedLoginMethod('extension')}
                      className="w-full p-4 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Radio className="w-6 h-6 text-primary" />
                          <div>
                            <h3 className="font-semibold">Browser Extension</h3>
                            <p className="text-sm text-muted-foreground">
                              Use your Nostr browser extension
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </button>

                    {/* Remote Signer / QR Code */}
                    <button 
                      onClick={() => setSelectedLoginMethod('remote')}
                      className="w-full p-4 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Smartphone className="w-6 h-6 text-primary" />
                          <div>
                            <h3 className="font-semibold">Remote Signer / QR Code</h3>
                            <p className="text-sm text-muted-foreground">
                              Connect with nsec.app or other Nostr apps
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </button>

                    {/* Import Private Key */}
                    <button 
                      onClick={() => setSelectedLoginMethod('nsec')}
                      className="w-full p-4 rounded-lg border-2 border-border hover:border-primary transition-all text-left bg-card hover:bg-card/80"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Key className="w-6 h-6 text-primary" />
                          <div>
                            <h3 className="font-semibold">Import Private Key (nsec)</h3>
                            <p className="text-sm text-muted-foreground">
                              Enter your private key directly
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </button>

                    {/* Relay Configuration */}
                    <div className="mt-6 p-4 border border-border rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-2">Configure Relays</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Set up which Nostr relays to use for your account
                      </p>
                      <Button variant="outline" size="sm">
                        <Settings className="w-4 h-4 mr-2" />
                        Manage Relays
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Show actual login functionality when method is selected */}
          {selectedPath === 'existing' && selectedLoginMethod && (
            <div className="space-y-4 animate-fade-in">
              <div className="border border-primary/20 rounded-lg bg-card">
                <div className="p-4 border-b border-primary/20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {selectedLoginMethod === 'extension' && 'Browser Extension Login'}
                      {selectedLoginMethod === 'remote' && 'Remote Signer / QR Code'}
                      {selectedLoginMethod === 'nsec' && 'Import Private Key'}
                    </h4>
                    <Button 
                      onClick={() => setSelectedLoginMethod(null)}
                      variant="ghost" 
                      size="sm"
                    >
                      Back
                    </Button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {selectedLoginMethod === 'extension' && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Connect with your Nostr browser extension (Alby, nos2x, etc.)
                      </p>
                      <Button 
                        onClick={handleExtensionLogin}
                        disabled={connectionState === 'connecting'}
                        className="w-full bg-primary hover:bg-primary/90"
                      >
                        {connectionState === 'connecting' ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Radio className="w-4 h-4 mr-2" />
                            Connect Extension
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {selectedLoginMethod === 'remote' && (
                    <div className="space-y-4">
                      {remoteSignerMode === 'select' && (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Connect with a remote Nostr signer app
                          </p>
                          <div className="space-y-3">
                            <Button 
                              onClick={startBunkerLogin}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              <QrCode className="w-4 h-4 mr-2" />
                              Scan QR Code (nsec.app, Amber)
                            </Button>
                            <Button 
                              onClick={() => setRemoteSignerMode('nostrconnect')}
                              variant="outline"
                              className="w-full"
                            >
                              <Link2 className="w-4 h-4 mr-2" />
                              Paste Connection String
                            </Button>
                          </div>
                        </>
                      )}

                      {remoteSignerMode === 'bunker' && connectionState === 'waiting' && bunkerUrl && (
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
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
                          <p className="text-sm text-muted-foreground">
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
                              // Handle nostrconnect login
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

                  {selectedLoginMethod === 'nsec' && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
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
                        >
                          {connectionState === 'connecting' ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Key className="w-4 h-4 mr-2" />
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
            </div>
          )}

          {selectedPath === 'new' && !generatedKeys && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-6 border-2 border-primary rounded-lg bg-card">
                <h3 className="font-semibold text-lg mb-2">Create Your Nostr Account</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  We'll generate a new cryptographic key pair for you. This is your Nostr identity.
                </p>
                
                <Button 
                  onClick={generateNewKeypair}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  Generate My Keys
                </Button>
              </div>
            </div>
          )}

          {selectedPath === 'new' && generatedKeys && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-6 border-2 border-green-500 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle className="w-5 h-5" />
                  <h3 className="font-semibold">Keys Generated!</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Your Public Key (npub)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={generatedKeys.npub}
                        readOnly
                        className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-background"
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
                    <label className="text-sm font-medium mb-1 block">
                      Your Private Key (nsec)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={generatedKeys.nsec}
                        readOnly
                        className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-background"
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
                
                <div className="flex items-start gap-2 mt-4">
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
                
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => setSelectedPath(null)}
                    variant="outline"
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={completeAccountCreation}
                    disabled={!hasConfirmedSave}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    Continue to Journal
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Learn More Link */}
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
      </div>

      {/* Info Modal */}
      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} />
      )}
    </>
  )
}
