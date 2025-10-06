"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getRelays as getRelaysFromManager, getDefaultRelays, saveRelays } from "@/lib/relay-manager"

const DEFAULT_RELAYS = ["wss://relay.nsec.app", "wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

interface RelayManagerProps {
  onClose?: () => void
  onSave?: (relays: string[]) => void
  initialRelays?: string[]
}

export function RelayManager({ onClose, onSave, initialRelays }: RelayManagerProps) {
  const [relays, setRelays] = useState<string[]>([])
  const [newRelay, setNewRelay] = useState("")

  useEffect(() => {
    if (initialRelays && initialRelays.length > 0) {
      setRelays(initialRelays)
    } else {
      const savedRelays = localStorage.getItem("nostr_user_relays")
      if (savedRelays) {
        try {
          setRelays(JSON.parse(savedRelays))
        } catch {
          setRelays(getDefaultRelays())
        }
      } else {
        setRelays(getDefaultRelays())
      }
    }
  }, [initialRelays])

  const handleAddRelay = () => {
    if (!newRelay.trim()) return
    if (!newRelay.startsWith("wss://") && !newRelay.startsWith("ws://")) {
      alert("Relay URL must start with wss:// or ws://")
      return
    }
    if (relays.includes(newRelay)) {
      alert("This relay is already in your list")
      return
    }
    setRelays([...relays, newRelay])
    setNewRelay("")
  }

  const handleRemoveRelay = (relay: string) => {
    setRelays(relays.filter((r) => r !== relay))
  }

  const handleSave = () => {
    // Save to localStorage with the same key as login page
    localStorage.setItem("nostr_user_relays", JSON.stringify(relays))
    
    // Also save using the relay manager function
    saveRelays(relays)
    
    if (onSave) {
      onSave(relays)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleReset = () => {
    setRelays(getDefaultRelays())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Manage Relays</h2>
          {onClose && (
            <Button onClick={onClose} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Your Relays</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {relays.map((relay) => (
                <div key={relay} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm text-foreground font-mono truncate">{relay}</span>
                  <Button
                    onClick={() => handleRemoveRelay(relay)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Add New Relay</label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                placeholder="wss://relay.example.com"
                className="flex-1 bg-muted border-border text-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddRelay()
                  }
                }}
              />
              <Button onClick={handleAddRelay} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleReset}
              variant="outline"
              className="flex-1 border-border text-foreground hover:bg-muted bg-transparent"
            >
              Reset to Default
            </Button>
            <Button onClick={handleSave} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export for backward compatibility
export { getRelaysFromManager as getRelays }
