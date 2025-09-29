"use client"
import dynamic from "next/dynamic"
import { X, Loader2 } from "lucide-react"

const NwcScannerLogic = dynamic(() => import("./nwc-scanner-logic"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center space-y-4 h-64">
      <Loader2 className="h-16 w-16 animate-spin text-slate-400" />
      <p className="text-slate-400">Loading Scanner...</p>
    </div>
  ),
})

interface NwcConnectionManagerProps {
  onConnectSuccess: (result: { pubkey: string; connectionString: string }) => void
  onClose: () => void
}

export function NwcConnectionManager({ onConnectSuccess, onClose }: NwcConnectionManagerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg bg-slate-800 p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>
        <NwcScannerLogic onConnectSuccess={onConnectSuccess} onClose={onClose} />
      </div>
    </div>
  )
}

export default NwcConnectionManager
