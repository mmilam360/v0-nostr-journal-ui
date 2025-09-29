"use client"

import { useState } from "react"
import { Send, X, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Note } from "@/components/main-app"

interface PublishConfirmationModalProps {
  note: Note
  onConfirm: () => Promise<string>
  onCancel: () => void
}

export default function PublishConfirmationModal({ note, onConfirm, onCancel }: PublishConfirmationModalProps) {
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{
    success: boolean
    eventId?: string
    error?: string
  } | null>(null)

  const handleConfirm = async () => {
    setIsPublishing(true)
    setPublishResult(null)

    try {
      const eventId = await onConfirm()
      setPublishResult({
        success: true,
        eventId,
      })

      // Auto-close after successful publish
      setTimeout(() => {
        onCancel()
      }, 3000)
    } catch (error) {
      setPublishResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to publish",
      })
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Publish to Nostr</h2>
          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-700"
            disabled={isPublishing}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {publishResult && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
              publishResult.success ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"
            }`}
          >
            {publishResult.success ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-green-300 font-medium">Successfully published to Nostr!</p>
                  <p className="text-green-400 text-sm mt-1">Event ID: {publishResult.eventId}</p>
                  <p className="text-slate-400 text-xs mt-1">Published to multiple relays for better visibility</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-300 font-medium">Failed to publish</p>
                  <p className="text-red-400 text-sm mt-1">{publishResult.error}</p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-6">
          <p className="text-slate-300 mb-4">This will publish the following content to your Nostr feed:</p>

          <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 max-h-60 overflow-y-auto">
            <div className="text-slate-200 whitespace-pre-wrap break-words">
              {note.content || "No content to publish"}
            </div>
          </div>

          {note.tags.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-slate-400 mb-2">Tags:</p>
              <div className="flex flex-wrap gap-2">
                {note.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-sm">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!publishResult && (
            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Will publish to multiple Nostr relays:</p>
              <p className="text-xs text-slate-500">
                relay.damus.io, nos.lol, relay.nostr.band, nostr.wine, relay.snort.social, and more
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            onClick={onCancel}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
            disabled={isPublishing}
          >
            {publishResult?.success ? "Close" : "Cancel"}
          </Button>
          {!publishResult?.success && (
            <Button
              onClick={handleConfirm}
              disabled={!note.content.trim() || isPublishing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {isPublishing ? "Publishing..." : "Publish to Nostr"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
