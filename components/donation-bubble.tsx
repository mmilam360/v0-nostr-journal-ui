"use client"

import { useState } from "react"
import { Zap, X, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function DonationBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [amount, setAmount] = useState("")

  const lightningAddress = "michaelmilam@getalby.com"

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lightningAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleLightningPayment = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("Please enter a valid amount in sats")
      return
    }

    // Open lightning URL with amount
    const lightningUrl = `lightning:${lightningAddress}?amount=${Number(amount) * 1000}` // Convert sats to millisats
    window.open(lightningUrl, "_blank")
  }

  const getLightningInvoiceQR = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`lightning:${lightningAddress}`)}`
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`lightning:${lightningAddress}?amount=${Number(amount) * 1000}`)}`
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <Button
          onClick={() => setIsOpen(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-full text-sm"
          title="Support development with Lightning ⚡"
        >
          <Zap className="w-4 h-4 text-orange-400" />
          <span>Support Devs</span>
        </Button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          {/* Modal content */}
          <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full p-1.5 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">Support Development</h2>
              <p className="text-slate-400 text-xs">Help keep Nostr Journal running</p>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-700 rounded-lg p-3">
                <label className="text-xs text-slate-300 mb-2 block">Amount (sats)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount (e.g., 1000)"
                  className="bg-slate-800 border-slate-600 text-white placeholder-slate-400 text-sm"
                  min="1"
                />
                <p className="text-slate-400 text-xs mt-1">Optional: Leave empty for any amount</p>
              </div>

              <div className="bg-slate-700 rounded-lg p-3 text-center">
                <label className="text-xs text-slate-300 mb-2 block">Scan with Lightning Wallet</label>
                <div className="bg-white p-3 rounded-lg inline-block">
                  <img
                    src={getLightningInvoiceQR() || "/placeholder.svg"}
                    alt="Lightning Payment QR Code"
                    className="w-40 h-40"
                  />
                </div>
                <p className="text-slate-400 text-xs mt-2">
                  {amount ? `Invoice for ${amount} sats` : "Scan to send any amount"}
                </p>
              </div>

              {/* Lightning address */}
              <div className="bg-slate-700 rounded-lg p-3">
                <label className="text-xs text-slate-300 mb-2 block">Lightning Address</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-orange-400 text-xs bg-slate-800 px-2 py-1.5 rounded border border-slate-600 truncate">
                    {lightningAddress}
                  </code>
                  <Button
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-600 bg-transparent p-2"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              {/* Pay button */}
              <Button
                onClick={handleLightningPayment}
                disabled={!amount || isNaN(Number(amount)) || Number(amount) <= 0}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
              >
                <Zap className="w-4 h-4" />
                {amount ? `Pay ${amount} sats` : "Enter amount to pay"}
              </Button>

              <p className="text-slate-400 text-xs text-center">
                Scan QR or click Pay to open in your Lightning wallet
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
