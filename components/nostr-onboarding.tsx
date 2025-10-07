"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Copy, 
  Check, 
  Download, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Key, 
  Lock, 
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft
} from "lucide-react"

interface OnboardingProps {
  onComplete: (nsec: string) => void
  onCancel: () => void
}

type OnboardingStep = 'welcome' | 'generate' | 'backup' | 'confirm' | 'complete'

export function NostrOnboarding({ onComplete, onCancel }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [keys, setKeys] = useState<{ npub: string; nsec: string } | null>(null)
  const [showNsec, setShowNsec] = useState(false)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [copiedNsec, setCopiedNsec] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  
  // Confirmation checklist
  const [confirmations, setConfirmations] = useState({
    saved: false,
    understand: false,
    noRecovery: false,
  })

  // Generate new Nostr keys
  const generateKeys = async () => {
    try {
      const { generateSecretKey, getPublicKey } = await import('nostr-tools/pure')
      const { nsecEncode, npubEncode } = await import('nostr-tools/nip19')
      
      // Generate keys
      const secretKey = generateSecretKey()
      const publicKey = getPublicKey(secretKey)
      
      // Encode to bech32 format
      const nsec = nsecEncode(secretKey)
      const npub = npubEncode(publicKey)
      
      setKeys({ npub, nsec })
      setStep('generate')
      
      console.log('[Onboarding] ✅ Keys generated successfully')
    } catch (error) {
      console.error('[Onboarding] ❌ Failed to generate keys:', error)
      alert('Failed to generate keys. Please try again.')
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'npub' | 'nsec') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'npub') {
        setCopiedNpub(true)
        setTimeout(() => setCopiedNpub(false), 2000)
      } else {
        setCopiedNsec(true)
        setTimeout(() => setCopiedNsec(false), 2000)
      }
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Download keys as text file
  const downloadKeys = () => {
    if (!keys) return
    
    const content = `NOSTR JOURNAL - YOUR KEYS
================================

🔑 PUBLIC KEY (npub) - Safe to share
${keys.npub}

🔐 PRIVATE KEY (nsec) - NEVER SHARE THIS
${keys.nsec}

================================
IMPORTANT SECURITY INFORMATION
================================

✅ Your PUBLIC KEY (npub) is your Nostr identity
   - Share this with others to let them find you
   - This is like your username or email address

❌ Your PRIVATE KEY (nsec) must be kept SECRET
   - This is like your password
   - Anyone with this key can access your account
   - NEVER share this with anyone
   - There is NO way to recover this if lost

📝 BACKUP CHECKLIST:
□ Save this file in a secure location
□ Consider saving in a password manager
□ Store a physical copy in a safe place
□ NEVER share your nsec with anyone

Generated: ${new Date().toLocaleString()}
App: Nostr Journal (nostrjournal.com)
`
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nostr-keys-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    setDownloaded(true)
    console.log('[Onboarding] 💾 Keys downloaded')
  }

  // Check if all confirmations are checked
  const allConfirmed = confirmations.saved && confirmations.understand && confirmations.noRecovery

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* STEP 1: WELCOME */}
        {step === 'welcome' && (
          <>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-6 h-6 text-primary" />
                <CardTitle>Create Your Nostr Account</CardTitle>
              </div>
              <CardDescription>
                Set up your decentralized identity in 3 simple steps
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      What is Nostr?
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Nostr is a decentralized protocol that gives you true ownership of your identity and data. 
                      No company can ban you, censor you, or take away your account.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <Lock className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      Your Keys, Your Identity
                    </h3>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      You'll receive two keys: a <strong>public key</strong> (like your username) that you can 
                      share, and a <strong>private key</strong> (like your password) that you must keep secret.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                      You Are Responsible for Your Keys
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Unlike traditional apps, there is <strong>no way to reset your password</strong>. 
                      If you lose your private key, you lose access to your account permanently.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">What happens next:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                    We'll generate your unique Nostr keys
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                    You'll securely save your private key
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                    You'll start using Nostr Journal
                  </li>
                </ol>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={generateKeys} className="gap-2">
                Generate My Keys
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {/* STEP 2: KEYS GENERATED */}
        {step === 'generate' && keys && (
          <>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <CardTitle>Your Nostr Keys</CardTitle>
              </div>
              <CardDescription>
                Save these keys in a secure location - you'll need them to access your account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Public Key (npub) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20">
                    <Key className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Public Key (npub)</h3>
                    <p className="text-xs text-muted-foreground">Safe to share - this is your Nostr identity</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                  <code className="flex-1 text-xs font-mono break-all">
                    {keys.npub}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(keys.npub, 'npub')}
                  >
                    {copiedNpub ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Private Key (nsec) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20">
                    <Lock className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Private Key (nsec)</h3>
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      NEVER SHARE THIS - Keep it secret and secure
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                  <code className="flex-1 text-xs font-mono break-all">
                    {showNsec ? keys.nsec : '•'.repeat(63)}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowNsec(!showNsec)}
                  >
                    {showNsec ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(keys.nsec, 'nsec')}
                  >
                    {copiedNsec ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Download Button */}
              <Button
                onClick={downloadKeys}
                variant={downloaded ? "outline" : "default"}
                className="w-full gap-2"
              >
                {downloaded ? (
                  <>
                    <Check className="w-4 h-4" />
                    Keys Downloaded
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Keys as Text File
                  </>
                )}
              </Button>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Important:</strong> Make sure to save your private key (nsec) before continuing. 
                  There is no way to recover it if lost. Consider:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Downloading the text file and storing it securely</li>
                    <li>Saving it in a password manager (recommended)</li>
                    <li>Writing it down on paper and keeping it in a safe place</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('welcome')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={() => setStep('backup')} className="gap-2">
                I've Saved My Keys
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {/* STEP 3: BACKUP CONFIRMATION */}
        {step === 'backup' && keys && (
          <>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-6 h-6 text-amber-600" />
                <CardTitle>Confirm Your Backup</CardTitle>
              </div>
              <CardDescription>
                Please confirm you understand how to protect your Nostr account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>This is your last chance to save your keys!</strong> Once you close this window, 
                  you'll need your nsec to log in. There is no password reset or account recovery.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <h3 className="font-semibold">Before you continue, please confirm:</h3>
                
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors">
                    <Checkbox
                      checked={confirmations.saved}
                      onCheckedChange={(checked) => 
                        setConfirmations(prev => ({ ...prev, saved: checked as boolean }))
                      }
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        I have saved my private key (nsec) in a secure location
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Downloaded the file, saved to password manager, or written down
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors">
                    <Checkbox
                      checked={confirmations.understand}
                      onCheckedChange={(checked) => 
                        setConfirmations(prev => ({ ...prev, understand: checked as boolean }))
                      }
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        I understand my private key is like a password
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Anyone with access to my nsec can control my Nostr account
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors">
                    <Checkbox
                      checked={confirmations.noRecovery}
                      onCheckedChange={(checked) => 
                        setConfirmations(prev => ({ ...prev, noRecovery: checked as boolean }))
                      }
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        I understand there is NO way to recover my account if I lose my nsec
                      </p>
                      <p className="text-xs text-muted-foreground">
                        No email recovery, no password reset - if lost, it's gone forever
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Show keys again for final check */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Your keys (tap to reveal and copy):</p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-16">npub:</span>
                    <code className="flex-1 text-xs font-mono break-all bg-secondary p-2 rounded">
                      {keys.npub.slice(0, 20)}...{keys.npub.slice(-20)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(keys.npub, 'npub')}
                    >
                      {copiedNpub ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-red-600 w-16">nsec:</span>
                    <code className="flex-1 text-xs font-mono break-all bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-200 dark:border-red-900">
                      {showNsec ? keys.nsec.slice(0, 20) + '...' + keys.nsec.slice(-20) : '•'.repeat(43)}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNsec(!showNsec)}
                    >
                      {showNsec ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(keys.nsec, 'nsec')}
                    >
                      {copiedNsec ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('generate')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => setStep('complete')} 
                disabled={!allConfirmed}
                className="gap-2"
              >
                Continue to Nostr Journal
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {/* STEP 4: COMPLETE */}
        {step === 'complete' && keys && (
          <>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <CardTitle>Welcome to Nostr! 🎉</CardTitle>
              </div>
              <CardDescription>
                Your account is ready - let's get started with Nostr Journal
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      Your Nostr Identity is Created
                    </h3>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      You can now use this identity across all Nostr apps - not just Nostr Journal!
                    </p>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Quick Tips:</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Your notes are <strong>encrypted</strong> and stored on Nostr relays</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>You can access your journal from any device using your nsec</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Your identity works across all Nostr apps (Primal, Damus, etc.)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Click the 🔍 Verify button on any note to prove it's on Nostr</span>
                    </li>
                  </ul>
                </div>

                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Remember:</strong> You'll need your <code className="text-xs bg-secondary px-1 py-0.5 rounded">nsec</code> to 
                    log in next time. Keep it safe!
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
            
            <CardFooter>
              <Button onClick={() => onComplete(keys.nsec)} className="w-full gap-2">
                Start Journaling
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
