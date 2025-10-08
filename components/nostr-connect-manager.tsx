"use client"
import dynamic from "next/dynamic"
import { X, Loader2 } from "lucide-react"
import { setActiveSigner } from "@/lib/signer-connector"

const NostrConnectLogic = dynamic(() => import("./nostrconnect-client-connector"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center space-y-4 h-64">
      <Loader2 className="h-16 w-16 animate-spin text-slate-400" />
      <p className="text-slate-400">Loading Secure Connector...</p>
    </div>
  ),
})

interface NostrConnectManagerProps {
  onConnectSuccess: (result: { pubkey: string }) => void
  onClose: () => void
}

export function NostrConnectManager({ onConnectSuccess, onClose }: NostrConnectManagerProps) {
  const handleConnectSuccess = async (result: { pubkey: string; sessionData: any }) => {
    console.log('[NostrConnectManager] Connection successful:', result.pubkey);
    // Set the active signer for the session
    setActiveSigner(result.sessionData);
    await onConnectSuccess({ pubkey: result.pubkey });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg bg-slate-800 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>
        <NostrConnectLogic onConnectSuccess={handleConnectSuccess} onClose={onClose} />
      </div>
    </div>
  )
}
