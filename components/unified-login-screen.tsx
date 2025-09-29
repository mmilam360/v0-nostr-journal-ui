"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus, ShieldCheck, Zap } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import CreateAccountModal from "@/components/create-account-modal"
import BunkerConnectModal from "@/components/bunker-connect-modal"

interface UnifiedLoginScreenProps {
  onCreateAccount: (password: string) => Promise<void>
  onBunkerConnect: (bunkerUrl: string) => Promise<void>
  onExtensionLogin: (pubkey: string) => Promise<void>
}

export default function UnifiedLoginScreen({
  onCreateAccount,
  onBunkerConnect,
  onExtensionLogin,
}: UnifiedLoginScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showBunkerModal, setShowBunkerModal] = useState(false)
  const { toast } = useToast()

  const handleExtensionLogin = async () => {
    try {
      // Check if window.nostr exists
      if (!window.nostr) {
        toast({
          title: "Browser extension not found",
          description: "Please install a Nostr browser extension like Alby or nos2x",
          variant: "destructive",
        })
        return
      }

      // Get public key from extension
      const pubkey = await window.nostr.getPublicKey()

      if (!pubkey) {
        toast({
          title: "Failed to get public key",
          description: "Could not retrieve public key from browser extension",
          variant: "destructive",
        })
        return
      }

      await onExtensionLogin(pubkey)
    } catch (error) {
      toast({
        title: "Extension login failed",
        description: error instanceof Error ? error.message : "Failed to connect with browser extension",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl text-white">Welcome to Nostr Journal</CardTitle>
          <CardDescription className="text-slate-400 text-lg">
            Your private, sovereign notes. How would you like to connect?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Option 1: Create New Account */}
          <Card
            className="cursor-pointer transition-all hover:bg-slate-700/50 border-slate-600 hover:border-slate-500"
            onClick={() => setShowCreateModal(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <UserPlus className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">Create a New Account</h3>
                  <p className="text-slate-400 text-sm">
                    Perfect for new users. We'll create a new, secure Nostr identity for you and save it encrypted on
                    this device.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Use Signing App */}
          <Card
            className="cursor-pointer transition-all hover:bg-slate-700/50 border-slate-600 hover:border-slate-500"
            onClick={() => setShowBunkerModal(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-green-600 rounded-lg">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">Use a Signing App</h3>
                  <p className="text-slate-400 text-sm">
                    The most secure way to connect an existing account. Use a remote signer like Nsec.app to approve
                    actions without sharing your key.
                  </p>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded">
                      Recommended & Secure
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Option 3: Browser Extension */}
          <Card
            className="cursor-pointer transition-all hover:bg-slate-700/50 border-slate-600 hover:border-slate-500"
            onClick={handleExtensionLogin}
          >
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-yellow-600 rounded-lg">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">Use Browser Extension</h3>
                  <p className="text-slate-400 text-sm">
                    Connect instantly if you have a browser extension like Alby. Good for quick access.
                  </p>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                      Quick & Easy
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Modals */}
      {showCreateModal && (
        <CreateAccountModal onCreateAccount={onCreateAccount} onClose={() => setShowCreateModal(false)} />
      )}

      {showBunkerModal && <BunkerConnectModal onConnect={onBunkerConnect} onClose={() => setShowBunkerModal(false)} />}
    </div>
  )
}

// Extend window interface for TypeScript
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: any): Promise<any>
    }
  }
}
