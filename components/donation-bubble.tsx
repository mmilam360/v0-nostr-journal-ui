"use client"

import { useState, useEffect, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Zap, X, Loader2, Copy, Check } from "lucide-react"

const MY_LIGHTNING_ADDRESS = "michaelmilam@getalby.com"

export default function DonationBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [satAmount, setSatAmount] = useState(1000)
  const [invoice, setInvoice] = useState("") // This will hold the real 'lnbc...' invoice
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [copied, setCopied] = useState(false)

  const generateInvoice = useCallback(async (sats: number) => {
    if (!MY_LIGHTNING_ADDRESS || MY_LIGHTNING_ADDRESS.includes("your-lightning-address")) {
      setStatus("error")
      setErrorMessage("Lightning Address not configured.")
      return
    }
    if (sats <= 0) {
      setStatus("idle")
      setInvoice(`lightning:${MY_LIGHTNING_ADDRESS}`)
      return
    }

    setStatus("loading")
    setErrorMessage("")

    try {
      const [localPart, domain] = MY_LIGHTNING_ADDRESS.split("@")

      // Step 1: Fetch the LNURL metadata
      console.log("[v0] Fetching LNURL metadata from:", `https://${domain}/.well-known/lnurlp/${localPart}`)
      const lnurlpRes = await fetch(`https://${domain}/.well-known/lnurlp/${localPart}`)
      if (!lnurlpRes.ok) throw new Error("Could not contact Lightning provider.")
      const lnurlpData = await lnurlpRes.json()

      if (lnurlpData.status === "ERROR") throw new Error(lnurlpData.reason)

      // Step 2: Use the callback to request the invoice
      const callback = new URL(lnurlpData.callback)
      const millisats = sats * 1000
      callback.searchParams.set("amount", millisats.toString())

      console.log("[v0] Requesting invoice from callback:", callback.toString())
      const invoiceRes = await fetch(callback.toString())
      if (!invoiceRes.ok) throw new Error("Failed to get invoice from provider.")
      const invoiceData = await invoiceRes.json()

      if (invoiceData.status === "ERROR") throw new Error(invoiceData.reason)

      console.log("[v0] Successfully generated BOLT11 invoice:", invoiceData.pr)
      setInvoice(invoiceData.pr) // 'pr' is the standard field for the BOLT11 invoice
      setStatus("idle")
    } catch (e) {
      console.error("[v0] Failed to generate invoice:", e)
      setStatus("error")
      setErrorMessage(e instanceof Error ? e.message : "An unknown error occurred.")
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      generateInvoice(satAmount)
    }
  }, [isOpen, satAmount, generateInvoice])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("[v0] Failed to copy:", err)
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-full text-sm"
          aria-label="Support development with Lightning"
        >
          <Zap className="w-4 h-4 text-orange-400" />
          <span>Support Devs</span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-white">Tip with Lightning</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-700 rounded-full p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-white rounded-lg flex items-center justify-center mb-4 h-52">
          {status === "loading" && <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />}
          {status === "error" && <div className="text-center text-red-500 text-sm px-4">{errorMessage}</div>}
          {status === "idle" && invoice && <QRCodeSVG value={invoice.toUpperCase()} size={192} level="M" />}
        </div>

        <div className="relative mb-4">
          <input
            type="text"
            value={invoice}
            readOnly
            className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 pr-10 text-xs font-mono text-slate-400 truncate"
            placeholder="Invoice will appear here..."
          />
          <button
            onClick={copyToClipboard}
            disabled={!invoice || status === "loading"}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="number"
            value={satAmount}
            onChange={(e) => setSatAmount(Number.parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-700 text-white rounded-md p-2 text-center font-mono"
            min="1"
          />
          <span className="font-semibold text-slate-400">sats</span>
        </div>

        <p className="text-slate-400 text-xs text-center mt-4">Thank you for supporting open source! 💜</p>
      </div>
    </div>
  )
}
