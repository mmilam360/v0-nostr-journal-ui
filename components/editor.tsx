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
      <div className="flex-1 bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 text-slate-600 mx-auto mb-4 flex items-center justify-center text-4xl">✍️</div>
          <p className="text-slate-400">Select a note to view or create a new one to start writing.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-slate-900 flex flex-col w-full h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center gap-2 sm:gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="flex-1 bg-transparent border-none text-lg sm:text-xl font-semibold text-white placeholder-slate-500 focus:outline-none focus:ring-0 px-0"
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
                  ? "border-green-600 text-green-400 hover:bg-green-900/20"
                  : "border-slate-600 text-slate-500 opacity-50"
              }
            >
              💾 Save
            </Button>

            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              ✕ Delete
            </Button>

            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
            >
              📤 {getPublishButtonText()}
            </Button>
          </div>

          {/* Mobile buttons - making them always visible instead of dropdown */}
          <div className="sm:hidden flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
              size="sm"
              className={
                hasUnsavedChanges
                  ? "bg-green-600 hover:bg-green-500 text-xs px-2 no-select"
                  : "bg-slate-600 opacity-50 text-xs px-2 no-select"
              }
            >
              💾
            </Button>
            <Button
              onClick={handlePublishClick}
              disabled={!content.trim()}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs px-2 no-select"
            >
              📤 {selectedText ? "Highlight" : "Publish"}
            </Button>
            <Button
              onClick={handleDeleteClick}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-white text-xs px-2 no-select"
            >
              ✕
            </Button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onSelect={handleTextSelection}
          onMouseUp={handleTextSelection}
          onKeyUp={handleTextSelection}
          onFocus={handleTextSelection}
          placeholder="Start writing..."
          className="w-full h-full bg-transparent border-none text-white placeholder-slate-500 resize-none focus:ring-0 text-base sm:text-lg leading-relaxed"
        />
      </div>

      {/* Footer - Tags and Sync Status */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex flex-wrap gap-2 mb-3">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-sm"
            >
              #{tag}
              <button onClick={() => handleRemoveTag(tag)} className="text-slate-400 hover:text-white">
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
            className="flex-1 bg-slate-800 border-slate-600 text-white placeholder-slate-400"
          />
          <Button
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
          >
            Add
          </Button>
        </div>

        <div className="text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span>
            Created: {note.createdAt.toLocaleDateString()} {note.createdAt.toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && <span className="text-yellow-400 text-xs">● Auto-saving...</span>}
            <span>
              {note.lastSynced ? (
                <span className="text-green-400">
                  Synced: {note.lastSynced.toLocaleDateString()} {note.lastSynced.toLocaleTimeString()}
                </span>
              ) : (
                <span className="text-yellow-400">Not synced</span>
              )}
            </span>
          </div>
        </div>

        {selectedText && (
          <div className="text-xs text-blue-400 mt-2">
            Selected: "{selectedText.substring(0, 100)}
            {selectedText.length > 100 ? "..." : ""}"
          </div>
        )}
      </div>
    </div>
  )
}
