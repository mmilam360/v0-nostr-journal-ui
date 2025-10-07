"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Note } from "@/components/main-app"
import { useDebounce } from "@/hooks/useDebounce"
import { Copy, ExternalLink, ShieldCheck } from "lucide-react"
import VerifyNoteModal from "./verify-note-modal"

interface EditorProps {
  note: Note | null
  onUpdateNote: (note: Note) => void
  onPublishNote: (note: Note) => void
  onPublishHighlight: (note: Note, highlightedText: string) => void
  onDeleteNote: (note: Note) => void
  authData: any // AuthData type
}

export default function Editor({ note, onUpdateNote, onPublishNote, onPublishHighlight, onDeleteNote, authData }: EditorProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [newTag, setNewTag] = useState("")
  const [selectedText, setSelectedText] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
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

  const copyEventId = async (eventId: string) => {
    try {
      await navigator.clipboard.writeText(eventId)
    } catch (err) {
      console.error('Failed to copy event ID:', err)
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
    <div className="flex-1 bg-white dark:bg-background flex flex-col w-full h-full">
      {/* Clean Header */}
      <div className="border-b border-border px-8 py-6">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="w-full bg-transparent border-none outline-none text-3xl font-bold placeholder:text-muted-foreground focus:outline-none"
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
                  ? "border-primary text-primary hover:bg-primary/10"
                  : "border-border text-muted-foreground opacity-50"
              }
            >
              💾 Save
            </Button>

            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700"
            >
              ✕ Delete
            </Button>

            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
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
                  ? "bg-primary hover:bg-primary/90 text-white text-xs px-2 no-select"
                  : "bg-muted opacity-50 text-xs px-2 no-select"
              }
            >
              💾
            </Button>
            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              size="sm"
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-xs px-2 no-select"
            >
              📤 {selectedText ? "Highlight" : "Publish"}
            </Button>
            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 text-xs px-2 no-select"
            >
              ✕
            </Button>
          </div>
        </div>
      </div>

      {/* Clean Editor */}
      <div className="flex-1 px-8 py-6">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onSelect={handleTextSelection}
          onMouseUp={handleTextSelection}
          onKeyUp={handleTextSelection}
          onFocus={handleTextSelection}
          placeholder="Start writing..."
          className="w-full h-full bg-transparent border-none text-foreground placeholder-muted-foreground resize-none text-base leading-relaxed focus:outline-none"
        />
      </div>

      {/* Clean Footer - Tags and Sync Status */}
      <div className="border-t border-border px-8 py-4 bg-secondary/30">
        <div className="flex flex-wrap gap-2 mb-3">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm border border-primary/20"
            >
              #{tag}
              <button onClick={() => handleRemoveTag(tag)} className="text-primary/70 hover:text-primary">
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
            className="flex-1"
          />
          <Button
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            variant="outline"
            className="border-border"
          >
            Add
          </Button>
        </div>

        <div className="text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span className="mono">
            Created: {note.createdAt.toLocaleDateString()} {note.createdAt.toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && <span className="text-primary text-xs">● Auto-saving...</span>}
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

        {/* Verification Section */}
        {note.eventId && (
          <div className="border-t border-border pt-3 mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Event ID:</span>
              <div className="flex items-center gap-1">
                <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  {note.eventId.slice(0, 8)}...
                </code>
                <Button
                  onClick={() => copyEventId(note.eventId!)}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Copy Event ID"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  onClick={() => window.open(`https://nostr.band/e/${note.eventId}`, '_blank')}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="View on Nostr.band"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
                <Button
                  onClick={() => setShowVerify(true)}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Verify note details"
                >
                  <ShieldCheck className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {selectedText && (
          <div className="text-xs text-primary mt-2">
            Selected: "{selectedText.substring(0, 100)}
            {selectedText.length > 100 ? "..." : ""}"
          </div>
        )}
      </div>
      
      {/* Verification Modal */}
      <VerifyNoteModal
        isOpen={showVerify}
        onClose={() => setShowVerify(false)}
        note={note}
        authData={authData}
      />
    </div>
  )
}