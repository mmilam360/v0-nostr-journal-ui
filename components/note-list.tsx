"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Loader2, AlertCircle, CloudOff, AlertTriangle, Calendar, Plus, Copy, ExternalLink, Lock, ShieldCheck, Check } from "lucide-react"
import type { Note } from "@/components/main-app"
import VerifyNoteModal from "./verify-note-modal"

interface NoteListProps {
  notes: Note[]
  selectedNote: Note | null
  onSelectNote: (note: Note) => void
  onCreateNote: () => void
  onDeleteNote: (note: Note) => void
  onVerifyNote?: (note: Note) => void  // Add verify handler
  authData: any // AuthData type
}

export default function NoteList({ notes, selectedNote, onSelectNote, onCreateNote, onDeleteNote, onVerifyNote, authData }: NoteListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [showSyncWarning, setShowSyncWarning] = useState<string | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyNote, setVerifyNote] = useState<Note | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getSyncIcon = (note: Note) => {
    switch (note.syncStatus) {
      case "synced":
        return <CheckCircle className="w-3 h-3 status-synced" title="Synced to Nostr" />
      case "syncing":
        return <Loader2 className="w-3 h-3 status-syncing animate-spin" title="Syncing..." />
      case "error":
        return <AlertCircle className="w-3 h-3 status-error" title={note.syncError || "Sync failed"} />
      default:
        return <CloudOff className="w-3 h-3 status-local" title="Local only" />
    }
  }

  const handleNoteClick = (note: Note) => {
    console.log("[NoteList] Clicking note:", note.title, "syncStatus:", note.syncStatus)

    // Check if note is currently syncing
    if (note.syncStatus === "syncing") {
      console.log("[NoteList] Note is syncing, showing warning popup")
      setShowSyncWarning(note.id)
      return
    }

    // Otherwise, select the note normally
    console.log("[NoteList] Note not syncing, selecting normally")
    onSelectNote(note)
  }

  const handleDeleteClick = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    console.log("[v0] Note list delete clicked for:", note.id, note.title)
    onDeleteNote(note)
  }

  const copyEventId = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Stop note from opening
    
    try {
      await navigator.clipboard.writeText(eventId)
      setCopiedId(eventId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = eventId
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
      setCopiedId(eventId)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleVerifyNote = (note: Note) => {
    if (onVerifyNote) {
      onVerifyNote(note)
    } else {
      setVerifyNote(note)
      setShowVerify(true)
    }
  }

  return (
    <div className="w-full md:w-80 bg-white dark:bg-card flex flex-col h-full border-r border-border">
      <div className="p-4 border-b border-border">
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
          <Input
            placeholder="Search all notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button
          onClick={onCreateNote}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          New Note
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-4xl text-muted-foreground mb-4">📝</div>
            <p className="text-muted-foreground">
              {notes.length === 0
                ? "Your journal is empty. Create a new note to begin."
                : "No notes match your search."}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`relative group rounded-lg mb-2 transition-all hover-lift ${
                  selectedNote?.id === note.id
                    ? "bg-primary/5 border-primary"
                    : "bg-card border border-transparent hover:border-border"
                }`}
              >
                <button onClick={() => handleNoteClick(note)} className="w-full p-4 text-left">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className={`font-medium text-base ${
                      selectedNote?.id === note.id ? "text-primary" : "text-foreground"
                    }`}>
                      {note.title || "Untitled Note"}
                    </h3>
                    {getSyncIcon(note)}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {note.content || "No content yet..."}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <time>{new Date(note.lastModified).toLocaleDateString()}</time>
                    {note.tags.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{note.tags.length} tags</span>
                      </>
                    )}
                  </div>
                </button>
                
                {/* Verification Section - Show for ALL notes */}
                <div 
                  className="border-t border-border mt-3 pt-3 px-4 pb-2"
                  onClick={(e) => e.stopPropagation()} // CRITICAL: Stop propagation
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {/* Encryption indicator */}
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <Lock className="w-3 h-3" />
                        <span>Encrypted</span>
                      </div>
                      
                      {/* Sync status */}
                      {note.syncStatus === 'synced' && note.eventId && (
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>On Nostr</span>
                        </div>
                      )}
                      
                      {note.syncStatus === 'local' && (
                        <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="w-3 h-3" />
                          <span>Local only</span>
                        </div>
                      )}
                      
                      {note.syncStatus === 'syncing' && (
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Syncing...</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Event ID with actions - Show for synced notes */}
                    {note.eventId && (
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {note.eventId.slice(0, 8)}...
                        </code>
                        
                        <Button
                          onClick={(e) => copyEventId(note.eventId!, e)}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Copy Event ID"
                        >
                          {copiedId === note.eventId ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                        
                        {onVerifyNote && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleVerifyNote(note)
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            title="Verify on Nostr"
                          >
                            <ShieldCheck className="w-3 h-3" />
                          </Button>
                        )}
                        
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`https://nostr.band/e/${note.eventId}`, '_blank')
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="View on Nostr.band"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    
                    {!note.eventId && note.syncStatus !== 'error' && (
                      <span className="text-xs text-muted-foreground">
                        Not yet synced
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Warning Popup */}
      {showSyncWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-sm mx-4 border border-border shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-foreground">Note Syncing</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              This note is currently syncing to the network. Please wait for the sync to complete before opening it.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => setShowSyncWarning(null)}
                className="bg-primary hover:bg-primary/90"
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Verification Modal */}
      <VerifyNoteModal
        isOpen={showVerify}
        onClose={() => setShowVerify(false)}
        note={verifyNote}
        authData={authData}
      />
    </div>
  )
}