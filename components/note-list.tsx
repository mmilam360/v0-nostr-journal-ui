"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Loader2, AlertCircle, CloudOff, AlertTriangle } from "lucide-react"
import type { Note } from "@/components/main-app"

interface NoteListProps {
  notes: Note[]
  selectedNote: Note | null
  onSelectNote: (note: Note) => void
  onCreateNote: () => void
  onDeleteNote: (note: Note) => void
}

export default function NoteList({ notes, selectedNote, onSelectNote, onCreateNote, onDeleteNote }: NoteListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [showSyncWarning, setShowSyncWarning] = useState<string | null>(null)

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getSyncIcon = (note: Note) => {
    switch (note.syncStatus) {
      case 'synced':
        return <CheckCircle className="w-3 h-3 text-green-500" title="Synced to Nostr" />
      case 'syncing':
        return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" title="Syncing..." />
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" title={note.syncError || "Sync failed"} />
      default:
        return <CloudOff className="w-3 h-3 text-yellow-500" title="Local only" />
    }
  }

  const handleNoteClick = (note: Note) => {
    console.log("[NoteList] Clicking note:", note.title, "syncStatus:", note.syncStatus)
    
    // Check if note is currently syncing
    if (note.syncStatus === 'syncing') {
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

  return (
    <div className="w-full md:w-80 bg-slate-850 flex flex-col">
      <div className="p-3 md:p-4 border-b border-slate-700">
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <Input
            placeholder="Search all notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-600 text-white placeholder-slate-400"
          />
        </div>

        <Button
          onClick={onCreateNote}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-2 min-h-[44px]"
        >
          ➕ New Note
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-4xl text-slate-600 mb-4">📝</div>
            <p className="text-slate-400">
              {notes.length === 0
                ? "Your journal is empty. Create a new note to begin."
                : "No notes match your search."}
            </p>
          </div>
        ) : (
          <div className="p-2 md:p-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`relative group rounded-lg mb-2 transition-colors ${
                  selectedNote?.id === note.id ? "bg-slate-700" : "hover:bg-slate-800"
                }`}
              >
                <button onClick={() => handleNoteClick(note)} className="w-full p-4 text-left min-h-[44px]">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white truncate flex-1">{note.title || "Untitled Note"}</h3>
                    {getSyncIcon(note)}
                  </div>
                  <p className="text-slate-400 text-sm line-clamp-2">{note.content || "No content yet..."}</p>
                </button>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Warning Popup */}
      {showSyncWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-white">Note Syncing</h3>
            </div>
            <p className="text-slate-300 mb-6">
              This note is currently syncing to the network. Please wait for the sync to complete before opening it.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => setShowSyncWarning(null)}
                className="bg-slate-700 hover:bg-slate-600 text-white"
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
