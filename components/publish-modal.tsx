"use client"

import { useState } from "react"
import { CheckCircle, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PublishModalProps {
  eventId: string
  onClose: () => void
}

export default function PublishModal({ eventId, onClose }: PublishModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
        <div className="text-center mb-6">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Note Published Successfully!</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Nostr Event ID:</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-300 text-sm font-mono break-all">
              {eventId}
            </div>
            <Button
              onClick={handleCopy}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
            >
              <Copy className="w-4 h-4" />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-white">
          Close
        </Button>
      </div>
    </div>
  )
}
