"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus, ShieldCheck, Zap, HelpCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import CreateAccountModal from "@/components/create-account-modal"
import { NostrConnectManager } from "@/components/nostr-connect-manager"
import { BunkerConnectManager } from "@/components/bunker-connect-manager"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface UnifiedLoginScreenProps {
  onCreateAccount: (password: string) => Promise<void>
  onBunkerConnect: (result: { pubkey: string }) => Promise<void>
  onExtensionLogin: (pubkey: string) => Promise<void>
}

export default function UnifiedLoginScreen({
  onCreateAccount,
  onBunkerConnect,
  onExtensionLogin,
}: UnifiedLoginScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showNostrConnectModal, setShowNostrConnectModal] = useState(false)
  const [showBunkerConnectModal, setShowBunkerConnectModal] = useState(false)
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
    <TooltipProvider>
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl text-white">Connect to Nostr Journal</CardTitle>
            <CardDescription className="text-slate-400 text-lg">
              Choose your preferred connection method
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Option 1: Create New Account */}
            <button
              className="w-full p-6 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all text-left"
              onClick={() => setShowCreateModal(true)}
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-600 rounded-lg flex-shrink-0">
                  <UserPlus className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-white">Create a New Account</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-300" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-xs">
                        <p>For new users. Creates a secure Nostr identity and saves it encrypted in this browser.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Use Signing App */}
            <button
              className="w-full p-6 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all text-left"
              onClick={() => setShowNostrConnectModal(true)}
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-600 rounded-lg flex-shrink-0">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-white">Use a Signing App</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-300" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-xs">
                        <p>
                          Recommended. Securely connect using a nostrconnect-compatible app like Nsec.app, Alby, or
                          Amethyst without sharing your private key.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded">
                      Most Secure
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 3: Browser Extension */}
            <button
              className="w-full p-6 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all text-left"
              onClick={handleExtensionLogin}
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-yellow-600 rounded-lg flex-shrink-0">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-white">Use Browser Extension</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-300" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-xs">
                        <p>
                          Quickly connect using a browser extension like Alby. Good for read-only access or simple
                          actions.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                      Quick & Easy
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 4: Bunker Connect */}
            <button
              className="w-full p-6 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all text-left"
              onClick={() => setShowBunkerConnectModal(true)}
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-red-600 rounded-lg flex-shrink-0">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-white">Bunker Connect</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-300" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-xs">
                        <p>Connect using Bunker services. Secure and reliable for advanced users.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">
                      Secure & Reliable
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Modals */}
        {showCreateModal && (
          <CreateAccountModal onCreateAccount={onCreateAccount} onClose={() => setShowCreateModal(false)} />
        )}

        {showNostrConnectModal && (
          <NostrConnectManager onConnectSuccess={onBunkerConnect} onClose={() => setShowNostrConnectModal(false)} />
        )}

        {showBunkerConnectModal && (
          <BunkerConnectManager onConnectSuccess={onBunkerConnect} onClose={() => setShowBunkerConnectModal(false)} />
        )}
      </div>
    </TooltipProvider>
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
