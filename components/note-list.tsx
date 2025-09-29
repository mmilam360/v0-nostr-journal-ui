"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleDeleteClick = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    console.log("[v0] Note list delete clicked for:", note.id, note.title)
    onDeleteNote(note)
  }

  return (
    <div className="w-80 bg-slate-850 flex flex-col">
      <div className="p-4 border-b border-slate-700">
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
          className="w-full bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-2"
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
          <div className="p-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`relative group rounded-lg mb-2 transition-colors ${
                  selectedNote?.id === note.id ? "bg-slate-700" : "hover:bg-slate-800"
                }`}
              >
                <button onClick={() => onSelectNote(note)} className="w-full p-4 text-left">
                  <h3 className="font-semibold text-white mb-1 truncate pr-8">{note.title || "Untitled Note"}</h3>
                  <p className="text-slate-400 text-sm line-clamp-2">{note.content || "No content yet..."}</p>
                </button>

                <div className="absolute top-2 right-2">
                  <Button
                    onClick={(e) => handleDeleteClick(note, e)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete note"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
