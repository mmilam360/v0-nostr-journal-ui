"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Note } from "@/components/main-app"
import { useDebounce } from "@/hooks/useDebounce"

interface EditorProps {
  note: Note | null
  onUpdateNote: (note: Note) => void
  onPublishNote: (note: Note) => void
  onPublishHighlight: (note: Note, highlightedText: string) => void
  onDeleteNote: (note: Note) => void
}

export default function Editor({ note, onUpdateNote, onPublishNote, onPublishHighlight, onDeleteNote }: EditorProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [newTag, setNewTag] = useState("")
  const [selectedText, setSelectedText] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  const previousNoteDataRef = useRef<{ id: string; title: string; content: string } | null>(null)

  const debouncedTitle = useDebounce(title, 1500)
  const debouncedContent = useDebounce(content, 1500)

  useEffect(() => {
    if (note && note.id !== currentNoteIdRef.current) {
      // Save previous note if there were unsaved changes
      if (previousNoteDataRef.current && hasUnsavedChanges) {
        console.log("[v0] Saving previous note before switching:", previousNoteDataRef.current.id)
        const noteToSave = {
          ...note,
          id: previousNoteDataRef.current.id,
          title: previousNoteDataRef.current.title,
          content: previousNoteDataRef.current.content,
        } as Note
        onUpdateNote(noteToSave)
      }

      console.log("[v0] Switching to note:", note.id)
      setTitle(note.title)
      setContent(note.content)
      setHasUnsavedChanges(false)
      currentNoteIdRef.current = note.id
      previousNoteDataRef.current = { id: note.id, title: note.title, content: note.content }
    }
  }, [note])

  useEffect(() => {
    if (note && (debouncedTitle !== note.title || debouncedContent !== note.content)) {
      if (debouncedTitle.trim() || debouncedContent.trim()) {
        console.log("[v0] Auto-saving note after 1.5s delay...")
        const updatedNote = { ...note, title: debouncedTitle, content: debouncedContent }
        onUpdateNote(updatedNote)
        setHasUnsavedChanges(false)
        // Update previous note data ref
        previousNoteDataRef.current = { id: note.id, title: debouncedTitle, content: debouncedContent }
        console.log("[v0] Auto-save completed")
      }
    }
  }, [debouncedTitle, debouncedContent])

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    setHasUnsavedChanges(true)
  }

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    if (note && hasUnsavedChanges) {
      console.log("[v0] Manual save triggered...")

      const updatedNote = { ...note, title, content }
      onUpdateNote(updatedNote)
      setHasUnsavedChanges(false)
      // Update previous note data ref
      previousNoteDataRef.current = { id: note.id, title, content }
      console.log("[v0] Note saved immediately")
    }
  }

  const handleAddTag = () => {
    if (newTag.trim() && note && !note.tags.includes(newTag.trim())) {
      const updatedNote = { ...note, tags: [...note.tags, newTag.trim()] }
      onUpdateNote(updatedNote)
      setNewTag("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (note) {
      const updatedNote = { ...note, tags: note.tags.filter((tag) => tag !== tagToRemove) }
      onUpdateNote(updatedNote)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddTag()
    }
  }

  const handleTextSelection = () => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if (start !== end) {
      const selected = textarea.value.substring(start, end).trim()
      console.log("[v0] Text selection detected:", selected.length > 0 ? `"${selected.substring(0, 50)}..."` : "none")
      setSelectedText(selected)
    } else {
      console.log("[v0] No text selection")
      setSelectedText("")
    }
  }

  const handleDeleteClick = () => {
    console.log("[v0] Delete button clicked for note:", note?.id)
    if (note) {
      console.log("[v0] Calling onDeleteNote for modal")
      onDeleteNote(note)
    }
  }

  const handlePublishClick = () => {
    if (!note) return

    if (selectedText && selectedText.length > 0) {
      console.log("[v0] Publishing highlight:", selectedText.substring(0, 50) + "...")
      onPublishHighlight(note, selectedText)
    } else {
      console.log("[v0] Publishing full note")
      onPublishNote(note)
    }
  }

  const getPublishButtonText = () => {
    if (selectedText && selectedText.length > 0) {
      return "Publish Highlight to Nostr"
    }
    return "Publish to Nostr"
  }

  if (!note) {
    return (
      <div className="flex-1 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 text-muted-foreground mx-auto mb-4 flex items-center justify-center text-4xl">
            ✍️
          </div>
          <p className="text-muted-foreground">Select a note to view or create a new one to start writing.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background cyber-grid flex flex-col w-full h-full">
      {/* Cyberpunk Header */}
      <div className="p-4 border-b border-cyan-500/30 flex items-center gap-2 sm:gap-4 bg-card/50 backdrop-blur-sm">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="flex-1 bg-transparent border-none text-lg sm:text-xl font-semibold text-cyan-400 placeholder-muted-foreground focus:outline-none focus:ring-0 px-0 cyber-text"
        />

        <div className="flex items-center gap-2">
          {/* Desktop buttons */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
              variant="outline"
              size="sm"
              className={
                hasUnsavedChanges
                  ? "border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 hover-glow"
                  : "border-border text-muted-foreground opacity-50"
              }
            >
              💾 Save
            </Button>

            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover-glow"
            >
              ✕ Delete
            </Button>

            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              className="btn-cyber-secondary disabled:opacity-50 flex items-center gap-2 hover-glow"
            >
              📤 {getPublishButtonText()}
            </Button>
          </div>

          {/* Mobile buttons */}
          <div className="sm:hidden flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
              size="sm"
              className={
                hasUnsavedChanges
                  ? "bg-cyan-500 hover:bg-cyan-600 text-white text-xs px-2 no-select hover-glow"
                  : "bg-muted opacity-50 text-xs px-2 no-select"
              }
            >
              💾
            </Button>
            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              size="sm"
              className="btn-cyber-secondary disabled:opacity-50 text-xs px-2 no-select hover-glow"
            >
              📤 {selectedText ? "Highlight" : "Publish"}
            </Button>
            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 text-xs px-2 no-select hover-glow"
            >
              ✕
            </Button>
          </div>
        </div>
      </div>

      {/* Cyberpunk Editor */}
      <div className="flex-1 p-6">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onSelect={handleTextSelection}
          onMouseUp={handleTextSelection}
          onKeyUp={handleTextSelection}
          onFocus={handleTextSelection}
          placeholder="Start writing..."
          className="w-full h-full bg-transparent border-none text-foreground placeholder-muted-foreground resize-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 text-base sm:text-lg leading-relaxed neon-border rounded-lg p-4"
        />
      </div>

      {/* Cyberpunk Footer - Tags and Sync Status */}
      <div className="p-4 border-t border-cyan-500/30 bg-card/50 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2 mb-3">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm border border-cyan-500/30 neon-border"
            >
              #{tag}
              <button onClick={() => handleRemoveTag(tag)} className="text-cyan-400/70 hover:text-cyan-300 hover-glow">
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 mb-3">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a tag..."
            className="flex-1 bg-background/50 border-cyan-500/30 text-foreground placeholder-muted-foreground focus:border-cyan-500/50 focus:ring-cyan-500/20"
          />
          <Button
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            variant="outline"
            className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 bg-transparent hover-glow"
          >
            Add
          </Button>
        </div>

        <div className="text-xs cyber-text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span className="mono">
            Created: {note.createdAt.toLocaleDateString()} {note.createdAt.toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && <span className="text-cyan-400 text-xs pulse-neon">● Auto-saving...</span>}
            <span>
              {note.lastSynced ? (
                <span className="status-synced">
                  Synced: {note.lastSynced.toLocaleDateString()} {note.lastSynced.toLocaleTimeString()}
                </span>
              ) : (
                <span className="status-local">Not synced</span>
              )}
            </span>
          </div>
        </div>

        {selectedText && (
          <div className="text-xs text-primary mt-2">
            Selected: "{selectedText.substring(0, 100)}
            {selectedText.length > 100 ? "..." : ""}"
          </div>
        )}
      </div>
    </div>
  )
}