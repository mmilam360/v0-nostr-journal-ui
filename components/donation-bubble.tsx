"use client"

import { useState, useEffect } from "react"
import { Zap, X, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { QRCodeSVG } from "qrcode.react"

declare global {
  interface Window {
    webln?: {
      enable: () => Promise<void>
      sendPayment: (invoice: string) => Promise<{ preimage: string }>
      makeInvoice: (args: { amount?: number; defaultMemo?: string }) => Promise<{ paymentRequest: string }>
      sendPaymentAsync: (invoice: string) => Promise<{ preimage: string }>
      keysend: (args: { destination: string; amount: number; customRecords?: Record<string, string> }) => Promise<{
        preimage: string
      }>
    }
  }
}

export default function DonationBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [amount, setAmount] = useState<number>(1000)
  const [hasWebLN, setHasWebLN] = useState(false)
  const [isPayingWithWebLN, setIsPayingWithWebLN] = useState(false)
  const [lightningUri, setLightningUri] = useState<string>("")

  const lightningAddress = "michaelmilam@getalby.com"

  const quickAmounts = [1000, 5000, 10000, 21000]

  useEffect(() => {
    if (typeof window !== "undefined" && window.webln) {
      setHasWebLN(true)
    }
  }, [])

  useEffect(() => {
    if (amount > 0) {
      const millisats = amount * 1000
      const uri = `lightning:${lightningAddress}?amount=${millisats}`
      setLightningUri(uri)
      console.log("[v0] Generated Lightning URI:", uri)
    } else {
      setLightningUri(`lightning:${lightningAddress}`)
    }
  }, [amount])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lightningAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleWebLNPayment = async () => {
    if (!window.webln) {
      alert("WebLN wallet not found. Please install Alby extension.")
      return
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid amount in sats")
      return
    }

    setIsPayingWithWebLN(true)
    try {
      await window.webln.enable()

      const response = await fetch(`https://getalby.com/.well-known/lnurlp/michaelmilam`)
      const lnurlData = await response.json()

      if (lnurlData.callback) {
        const invoiceResponse = await fetch(`${lnurlData.callback}?amount=${amount * 1000}`)
        const invoiceData = await invoiceResponse.json()

        if (invoiceData.pr) {
          await window.webln.sendPayment(invoiceData.pr)
          alert("Payment sent! Thank you for supporting Nostr Journal! ⚡")
          setIsOpen(false)
        }
      }
    } catch (error) {
      console.error("WebLN payment failed:", error)
      alert("Payment failed. Please try copying the Lightning Address instead.")
    } finally {
      setIsPayingWithWebLN(false)
    }
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
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
              <p className="text-slate-400 text-xs">Help keep Nostr Journal free & open source! ⚡</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 mb-2 block">Quick Tips:</label>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(amt)}
                      className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                        amount === amt ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 mb-2 block">Custom Amount:</label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    placeholder="Amount in sats"
                    className="flex-1 bg-slate-900 border-slate-600 text-white placeholder-slate-400 text-sm"
                    min="1"
                  />
                  <span className="text-slate-400 text-sm">sats</span>
                </div>
              </div>

              {hasWebLN && (
                <Button
                  onClick={handleWebLNPayment}
                  disabled={!amount || amount <= 0 || isPayingWithWebLN}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center gap-2 disabled:opacity-50 text-sm min-h-[44px]"
                >
                  <Zap className="w-4 h-4" />
                  {isPayingWithWebLN ? "Processing..." : `Pay ${amount.toLocaleString()} sats with Alby`}
                </Button>
              )}

              <div className="bg-slate-700 rounded-lg p-3 text-center">
                <label className="text-xs text-slate-300 mb-2 block">Scan with Lightning Wallet</label>
                <div className="bg-white p-2 rounded-lg inline-block">
                  <QRCodeSVG value={lightningUri} size={224} level="M" className="w-48 h-48 sm:w-56 sm:h-56" />
                </div>
                <p className="text-slate-400 text-xs mt-2">
                  Scan to pay {amount > 0 ? `${amount.toLocaleString()} sats` : "any amount"}
                </p>
                <p className="text-slate-500 text-xs mt-1">(Amount is pre-filled in your wallet)</p>
              </div>

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
                    className="border-slate-600 text-slate-300 hover:bg-slate-600 bg-transparent p-2 min-h-[44px] min-w-[44px]"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-slate-400 text-xs mt-2">Suggested: {amount.toLocaleString()} sats</p>
              </div>

              <p className="text-slate-400 text-xs text-center">Thank you for supporting open source! 💜</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
