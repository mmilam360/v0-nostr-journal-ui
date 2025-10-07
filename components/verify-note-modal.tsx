"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Copy, ExternalLink, Lock, ShieldCheck } from 'lucide-react'
import type { Note } from '@/components/main-app'
import type { AuthData } from '@/components/main-app'

interface VerifyNoteModalProps {
  isOpen: boolean
  onClose: () => void
  note: Note | null
  authData: AuthData | null
}

export default function VerifyNoteModal({ isOpen, onClose, note, authData }: VerifyNoteModalProps) {
  const [copied, setCopied] = useState(false)

  if (!note || !authData) return null

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Verify Note on Nostr
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Event ID */}
          <div>
            <label className="text-sm font-medium block mb-2">Event ID</label>
            <div className="flex gap-2">
              <input
                value={note.eventId || 'Not yet synced to Nostr'}
                readOnly
                className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-muted text-foreground"
              />
              {note.eventId && (
                <Button 
                  onClick={() => copyToClipboard(note.eventId!)}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This is the unique identifier for your note on the Nostr network
            </p>
          </div>
          
          {/* Public Key */}
          <div>
            <label className="text-sm font-medium block mb-2">Author (Your Pubkey)</label>
            <input
              value={authData.pubkey}
              readOnly
              className="w-full px-3 py-2 border rounded font-mono text-sm bg-muted text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This is your Nostr public key that signed this event
            </p>
          </div>
          
          {/* Event Kind */}
          <div>
            <label className="text-sm font-medium block mb-2">Event Kind</label>
            <div className="px-3 py-2 border rounded bg-muted">
              <span className="text-sm font-mono">30078</span>
              <span className="text-sm text-muted-foreground ml-2">
                (Parameterized Replaceable Event)
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This event type is used for replaceable notes in Nostr
            </p>
          </div>
          
          {/* Encryption */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
              <Lock className="w-4 h-4" />
              <span className="text-sm font-medium">Content is encrypted with NIP-04</span>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              Only you can decrypt this note with your private key. The content is encrypted before 
              being stored on Nostr relays, ensuring your privacy.
            </p>
          </div>
          
          {/* View on Explorers */}
          {note.eventId && (
            <div>
              <label className="text-sm font-medium block mb-2">View on Nostr Explorers</label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => window.open(`https://nostr.band/e/${note.eventId}`, '_blank')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Nostr.band
                </Button>
                <Button
                  onClick={() => window.open(`https://nostrrr.com/e/${note.eventId}`, '_blank')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Nostrrr
                </Button>
                <Button
                  onClick={() => window.open(`https://nostr.wine/e/${note.eventId}`, '_blank')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Nostr.wine
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These explorers let you verify your note exists on the Nostr network
              </p>
            </div>
          )}
          
          {/* Note Details */}
          <div>
            <label className="text-sm font-medium block mb-2">Note Details</label>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Title:</span>
                <span className="font-medium">{note.title || 'Untitled'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span>{new Date(note.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Modified:</span>
                <span>{new Date(note.lastModified).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tags:</span>
                <span>{note.tags.length} tags</span>
              </div>
              {note.lastSynced && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Synced:</span>
                  <span>{new Date(note.lastSynced).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
