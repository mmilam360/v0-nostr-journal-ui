"use client"

import { useState } from "react"
import { Zap, X, Copy, Check, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// WebLN type definitions
declare global {
  interface Window {
    webln?: {
      enable: () => Promise<void>
      sendPayment: (paymentRequest: string) => Promise<{ preimage: string }>
      makeInvoice: (args: { amount: number; defaultMemo?: string }) => Promise<{ paymentRequest: string }>
    }
  }
}

export default function DonationBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(true)
  const [amount, setAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const lightningAddress = "michaelmilam@getalby.com"

  const lnurl = `lightning:${lightningAddress}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lightningAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleLightningPayment = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("Please enter a valid amount in sats")
      return
    }

    setIsProcessing(true)

    try {
      // Check if WebLN is available
      if (window.webln) {
        console.log("[v0] WebLN detected, attempting to enable...")
        await window.webln.enable()

        // Create an invoice for the specified amount
        const invoice = await window.webln.makeInvoice({
          amount: Number(amount),
          defaultMemo: `Donation to Nostr Journal - ${amount} sats`,
        })

        console.log("[v0] Invoice created, requesting payment...")
        await window.webln.sendPayment(invoice.paymentRequest)

        alert(`Successfully sent ${amount} sats! Thank you for supporting development! ⚡`)
        setAmount("")
        setIsOpen(false)
      } else {
        // Fallback to opening lightning URL
        const lightningUrl = `lightning:${lightningAddress}?amount=${Number(amount) * 1000}` // Convert sats to millisats
        window.open(lightningUrl, "_blank")
      }
    } catch (error) {
      console.error("[v0] Lightning payment failed:", error)
      alert(`Payment failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      {/* Floating donation bubble */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-400 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          title="Support development with Lightning ⚡"
        >
          <Zap className="w-6 h-6" />
        </Button>
      </div>

      {/* Donation modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md relative">
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Support Development</h2>
              <p className="text-slate-400 text-sm">
                Help keep Nostr Journal running and improving with a Lightning donation
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2 mb-4">
                <Button
                  onClick={() => setShowQR(false)}
                  size="sm"
                  variant={!showQR ? "default" : "outline"}
                  className={
                    !showQR
                      ? "bg-orange-500 hover:bg-orange-400"
                      : "border-slate-600 text-slate-300 hover:bg-slate-600 bg-transparent"
                  }
                >
                  Address
                </Button>
                <Button
                  onClick={() => setShowQR(true)}
                  size="sm"
                  variant={showQR ? "default" : "outline"}
                  className={
                    showQR
                      ? "bg-orange-500 hover:bg-orange-400"
                      : "border-slate-600 text-slate-300 hover:bg-slate-600 bg-transparent"
                  }
                >
                  <QrCode className="w-4 h-4 mr-1" />
                  QR Code
                </Button>
              </div>

              {showQR ? (
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <label className="text-sm text-slate-300 mb-3 block">Scan with Lightning Wallet</label>
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lnurl)}`}
                      alt="Lightning Payment QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-slate-400 text-xs mt-2">Scan with any Lightning wallet to send a donation</p>
                </div>
              ) : (
                <div className="bg-slate-700 rounded-lg p-4">
                  <label className="text-sm text-slate-300 mb-2 block">Lightning Address</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-orange-400 text-sm bg-slate-800 px-3 py-2 rounded border">
                      {lightningAddress}
                    </code>
                    <Button
                      onClick={handleCopy}
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-600 bg-transparent"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="bg-slate-700 rounded-lg p-4">
                <label className="text-sm text-slate-300 mb-2 block">Amount (sats)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount in sats (e.g., 1000)"
                  className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
                  min="1"
                />
                <p className="text-slate-400 text-xs mt-1">Minimum: 1 sat</p>
              </div>

              <Button
                onClick={handleLightningPayment}
                disabled={!amount || isNaN(Number(amount)) || Number(amount) <= 0 || isProcessing}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-5 h-5" />
                {isProcessing ? "Processing..." : "Pay with Lightning Wallet"}
              </Button>

              <p className="text-slate-400 text-xs text-center">
                {showQR
                  ? "Scan the QR code with your Lightning wallet, or enter an amount and click the button above"
                  : "Enter an amount and click to open in your Lightning wallet app, or copy the address to send manually"}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
