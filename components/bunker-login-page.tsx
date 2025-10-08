"use client"

/**
 * NOSTR REMOTE SIGNER LOGIN COMPONENT
 *
 * This component now uses the battle-tested nostr-signer-connector library
 * for reliable NIP-46 remote signer authentication
 */

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import NostrConnectClientConnector from "./nostrconnect-client-connector"
import { setActiveSigner } from "@/lib/signer-connector"

interface BunkerLoginPageProps {
  onLoginSuccess: (result: { pubkey: string; token: string; relay: string }) => void
  onBack?: () => void
}

export function BunkerLoginPage({ onLoginSuccess, onBack }: BunkerLoginPageProps) {
  const [showConnector, setShowConnector] = useState(true)

  const handleConnectSuccess = async (result: { pubkey: string; sessionData: any }) => {
    console.log('[BunkerLoginPage] Connection successful:', result.pubkey);
    // Set the active signer for the session
    setActiveSigner(result.sessionData);
    
    // Convert to the expected format for backward compatibility
    await onLoginSuccess({
      pubkey: result.pubkey,
      token: result.sessionData?.token || '',
      relay: 'wss://relay.nsec.app' // Default relay
    });
  };

  if (!showConnector) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Button
            onClick={onBack}
            variant="outline"
            className="mb-4 border-slate-600 text-slate-300"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login Options
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        {onBack && (
          <Button
            onClick={onBack}
            variant="outline"
            className="mb-4 border-slate-600 text-slate-300"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login Options
          </Button>
        )}

        {/* Use the new connector component */}
        <NostrConnectClientConnector
          onConnectSuccess={handleConnectSuccess}
          onClose={() => setShowConnector(false)}
        />
      </div>
    </div>
  )
}