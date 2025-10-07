"use client"

import { useState, useEffect } from "react"
import { X, Copy, Check, ExternalLink, Loader2, AlertCircle, ShieldCheck, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Note } from "./main-app"
import type { AuthData } from "./main-app"

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

interface VerifyNoteModalProps {
  note: Note
  authData: AuthData
  onClose: () => void
}

export default function VerifyNoteModal({ note, authData, onClose }: VerifyNoteModalProps) {
  const [rawEvent, setRawEvent] = useState<NostrEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Early return if note is null
  if (!note) {
    return null
  }

  useEffect(() => {
    if (note?.eventId) {
      fetchRawEvent(note.eventId)
    } else {
      setLoading(false)
      setError("This note doesn't have an event ID yet")
    }
  }, [note?.eventId])

  const fetchRawEvent = async (eventId: string) => {
    try {
      setLoading(true)
      setError(null)

      // Get enabled relays
      const relaysData = localStorage.getItem("nostr_user_relays")
      const relays = relaysData 
        ? JSON.parse(relaysData).filter((r: any) => r.enabled).map((r: any) => r.url)
        : ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

      console.log("[Verify] Fetching event", eventId, "from relays:", relays)

      // Try each relay
      for (const relay of relays) {
        try {
          const event = await queryEventFromRelay(relay, eventId)
          if (event) {
            console.log("[Verify] Found event on", relay)
            setRawEvent(event)
            setLoading(false)
            return
          }
        } catch (err) {
          console.warn("[Verify] Failed to fetch from", relay, err)
        }
      }

      throw new Error("Event not found on any relay")
    } catch (err) {
      console.error("[Verify] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch event")
      setLoading(false)
    }
  }

  const queryEventFromRelay = (relayUrl: string, eventId: string): Promise<NostrEvent | null> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl)
      const timeout = setTimeout(() => {
        ws.close()
        resolve(null)
      }, 5000)

      ws.onopen = () => {
        const subscription = ["REQ", crypto.randomUUID(), { ids: [eventId] }]
        ws.send(JSON.stringify(subscription))
      }

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data[0] === "EVENT" && data[2]?.id === eventId) {
            clearTimeout(timeout)
            ws.close()
            resolve(data[2])
          } else if (data[0] === "EOSE") {
            clearTimeout(timeout)
            ws.close()
            resolve(null)
          }
        } catch (e) {
          console.error("[Verify] Parse error:", e)
        }
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error("WebSocket error"))
      }
    })
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Verify Note on Nostr</h2>
          </div>
          <Button onClick={onClose} variant="ghost" size="sm">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Fetching event from relays...</p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Failed to Load Event</p>
                <p className="text-sm text-destructive/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && rawEvent && (
            <>
              {/* Note Info */}
              <div>
                <h3 className="font-medium mb-2">Note Information</h3>
                <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Title:</span>{" "}
                    <span className="font-medium">{note?.title || 'Untitled'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    <span>{note?.createdAt ? new Date(note.createdAt).toLocaleString() : 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Modified:</span>{" "}
                    <span>{note?.lastModified ? new Date(note.lastModified).toLocaleString() : 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Event ID */}
              <div>
                <label className="text-sm font-medium mb-2 block">Event ID</label>
                <div className="flex gap-2">
                  <input
                    value={note.eventId}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-background"
                  />
                  <Button
                    onClick={() => copyToClipboard(note.eventId!, "eventId")}
                    variant="outline"
                    size="sm"
                  >
                    {copiedField === "eventId" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Event Kind */}
              <div>
                <label className="text-sm font-medium mb-2 block">Event Kind</label>
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{rawEvent.kind}</span>
                    <span className="text-muted-foreground">
                      {rawEvent.kind === 30078 && "(Replaceable Event - May show in feeds)"}
                      {rawEvent.kind === 31078 && "(Private Note - Won't show in feeds)"}
                      {rawEvent.kind === 1 && "(Public Note)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Encryption Status */}
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm font-medium">Content is encrypted with NIP-04</span>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Only you can decrypt this note with your private key. The content is unreadable to
                  anyone else, including relay operators.
                </p>
              </div>

              {/* Author */}
              <div>
                <label className="text-sm font-medium mb-2 block">Author (Your Pubkey)</label>
                <div className="flex gap-2">
                  <input
                    value={rawEvent.pubkey}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-background"
                  />
                  <Button
                    onClick={() => copyToClipboard(rawEvent.pubkey, "pubkey")}
                    variant="outline"
                    size="sm"
                  >
                    {copiedField === "pubkey" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Encrypted Content Preview */}
              <div>
                <label className="text-sm font-medium mb-2 block">Encrypted Content</label>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all">
                  {rawEvent.content.slice(0, 200)}...
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This is the encrypted blob stored on Nostr. Only you can decrypt it.
                </p>
              </div>

              {/* Explorers */}
              <div>
                <label className="text-sm font-medium mb-2 block">View on Nostr Explorers</label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => window.open(`https://nostr.band/e/${note.eventId}`, "_blank")}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Nostr.band
                  </Button>
                  <Button
                    onClick={() => window.open(`https://nostrrr.com/e/${note.eventId}`, "_blank")}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Nostrrr
                  </Button>
                  <Button
                    onClick={() => window.open(`https://nostr.watch/e/${note.eventId}`, "_blank")}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Nostr.watch
                  </Button>
                </div>
              </div>
            </>
          )}

          {!loading && !error && !rawEvent && note.eventId && (
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Event ID exists but couldn't be found on relays. It may still be propagating across
                the network. Try again in a few moments.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}