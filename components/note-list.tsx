"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Loader2, AlertCircle, CloudOff, AlertTriangle, Calendar, Plus, Upload, Download } from "lucide-react"
import type { Note } from "@/components/main-app"

interface NoteListProps {
  notes: Note[]
  selectedNote: Note | null
  onSelectNote: (note: Note) => void
  onCreateNote: () => void
  onDeleteNote: (note: Note) => void
  authData: any // AuthData type
}

export default function NoteList({ notes, selectedNote, onSelectNote, onCreateNote, onDeleteNote, authData }: NoteListProps) {
  console.log("[NoteList] Received notes:", notes.length)
  console.log("[NoteList] Note IDs:", notes.map(n => n.id))
  console.log("[NoteList] Note titles:", notes.map(n => n.title))
  
  const [searchQuery, setSearchQuery] = useState("")
  const [showSyncWarning, setShowSyncWarning] = useState<string | null>(null)

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getSyncIcon = (note: Note) => {
    // Debug logging for sync status
    console.log(`[NoteList] Note "${note.title}": isSynced=${note.isSynced}, eventId=${note.eventId}, fetchedFromRelays=${note.fetchedFromRelays}, publishedToRelays=${note.publishedToRelays}`)
    
    // If note has eventId and was fetched from relays, it's definitely synced
    if (note.eventId && note.fetchedFromRelays) {
      return <CheckCircle className="w-3 h-3 text-green-500" title="Synced to Nostr" />
    }
    // If note has eventId but wasn't fetched from relays, it might be published but not verified
    else if (note.eventId) {
      return <AlertCircle className="w-3 h-3 text-yellow-500" title="Published but not verified" />
    }
    // If note was fetched from relays but has no eventId, something is wrong
    else if (note.fetchedFromRelays) {
      return <AlertCircle className="w-3 h-3 text-orange-500" title="Fetched from relays but no event ID" />
    }
    // Otherwise it's local only
    else {
      return <CloudOff className="w-3 h-3 text-gray-400" title="Local only" />
    }
  }

  const handleNoteClick = (note: Note) => {
    console.log("[NoteList] Clicking note:", note.title, "isSynced:", note.isSynced, "eventId:", note.eventId)

    // No need to check for syncing since events are instant now

    // Otherwise, select the note normally
    console.log("[NoteList] Note not syncing, selecting normally")
    onSelectNote(note)
  }

  const handleDeleteClick = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    console.log("[v0] Note list delete clicked for:", note.id, note.title)
    onDeleteNote(note)
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
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <time>{new Date(note.lastModified).toLocaleDateString()}</time>
                      {note.tags.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{note.tags.length} tags</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                
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
      
    </div>
  )
}