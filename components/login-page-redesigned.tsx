'use client'

import React, { useState } from 'react'
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
  Radio
} from 'lucide-react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import InfoModal from './info-modal'
import { LoginPage } from './login-page'

interface LoginPageRedesignedProps {
  onLoginSuccess: (authData: any) => void
}

interface GeneratedKeys {
  secretKey: Uint8Array
  publicKey: string
  nsec: string
  npub: string
}

export default function LoginPageRedesigned({ onLoginSuccess }: LoginPageRedesignedProps) {
  const [selectedPath, setSelectedPath] = useState<'existing' | 'new' | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null)
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false)

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

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          {/* Logo & Tagline */}
          <div className="text-center">
            <img 
              src="/Nostr Journal Logo.svg" 
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
              <div className="border border-primary/20 rounded-lg bg-primary/5">
                <div className="p-4 border-b border-primary/20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Sign in with Existing Account</h4>
                    <Button 
                      onClick={() => setSelectedPath(null)}
                      variant="ghost" 
                      size="sm"
                    >
                      Back
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  <LoginPage onLoginSuccess={onLoginSuccess} />
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
