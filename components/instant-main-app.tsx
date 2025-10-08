"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Badge } from "@/components/ui/badge" // Badge component doesn't exist
import { 
  Plus, 
  Save, 
  Trash2, 
  RefreshCw, 
  LogOut, 
  Cloud, 
  CloudOff,
  Loader2,
  Menu,
  X
} from "lucide-react"
import type { Note } from "@/lib/types"
import { loadAllNotesFromRelays, saveNoteInstantly, deleteNoteInstantly } from "@/lib/instant-nostr"

interface InstantMainAppProps {
  authData: any
  onLogout: () => void
}

export function InstantMainApp({ authData, onLogout }: InstantMainAppProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [lastLoadTime, setLastLoadTime] = useState<Date | null>(null)
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null)

  // Load ALL notes from relays instantly on startup - like nostrudel
  useEffect(() => {
    loadAllNotesInstantly()
    
    // Cleanup timer on unmount
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
      }
    }
  }, [authData])

  const loadAllNotesInstantly = async () => {
    try {
      setIsLoading(true)
      console.log("[InstantApp] Loading ALL notes from relays instantly...")
      
      // Load everything from relays - this is the nostrudel approach
      const allNotes = await loadAllNotesFromRelays(authData)
      
      console.log(`[InstantApp] Loaded ${allNotes.length} notes instantly from relays`)
      
      // Sort by last modified (newest first)
      const sortedNotes = allNotes.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      )
      
      setNotes(sortedNotes)
      setSelectedNote(sortedNotes[0] || null)
      setLastLoadTime(new Date())
      
      console.log("[InstantApp] ✅ All notes loaded instantly - no localStorage, no syncing!")
      
    } catch (error) {
      console.error("[InstantApp] Error loading notes:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createNote = async () => {
    const now = new Date()
    const dateTitle = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric", 
      year: "numeric",
    })

    const newNote: Note = {
      id: Date.now().toString(),
      title: dateTitle,
      content: "",
      tags: [],
      createdAt: now,
      lastModified: now,
    }

    // Add to local state immediately
    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    setSelectedNote(newNote)
    
    console.log("[InstantApp] Note created locally, will be saved to relays when user starts typing")
  }

  const updateNote = async (updatedNote: Note) => {
    // Update local state immediately
    const updatedNotes = notes.map(note => 
      note.id === updatedNote.id ? { ...updatedNote, lastModified: new Date() } : note
    )
    setNotes(updatedNotes)
    setSelectedNote(updatedNote)
    
    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    
    // Set new timer for 3-second debounced save
    const timer = setTimeout(async () => {
      try {
        console.log("[InstantApp] Auto-saving after 3 seconds of inactivity...")
        const result = await saveNoteInstantly(updatedNote, authData)
        if (result.success) {
          // Update with eventId
          const finalNote = { ...updatedNote, eventId: result.eventId, lastSynced: new Date() }
          const finalNotes = notes.map(n => n.id === updatedNote.id ? finalNote : n)
          setNotes(finalNotes)
          setSelectedNote(finalNote)
          console.log("[InstantApp] ✅ Note auto-saved to relays")
        } else {
          console.error("[InstantApp] Failed to auto-save to relays:", result.error)
        }
      } catch (error) {
        console.error("[InstantApp] Error auto-saving to relays:", error)
      }
    }, 3000) // 3 seconds
    
    setAutoSaveTimer(timer)
  }

  const deleteNote = async (noteToDelete: Note) => {
    if (!confirm(`Delete "${noteToDelete.title}"?`)) return
    
    try {
      // Remove from local state immediately
      const updatedNotes = notes.filter(note => note.id !== noteToDelete.id)
      setNotes(updatedNotes)
      setSelectedNote(updatedNotes[0] || null)
      
      // Delete from relays instantly if it has an eventId
      if (noteToDelete.eventId) {
        await deleteNoteInstantly(noteToDelete, authData)
        console.log("[InstantApp] ✅ Note deleted from relays instantly")
      }
      
    } catch (error) {
      console.error("[InstantApp] Error deleting note:", error)
    }
  }

  const refreshFromRelays = async () => {
    console.log("[InstantApp] Refreshing from relays...")
    await loadAllNotesInstantly()
  }

  const saveNow = async () => {
    if (!selectedNote) return
    
    // Clear timer and save immediately
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      setAutoSaveTimer(null)
    }
    
    try {
      console.log("[InstantApp] Manual save requested...")
      const result = await saveNoteInstantly(selectedNote, authData)
      if (result.success) {
        const finalNote = { ...selectedNote, eventId: result.eventId, lastSynced: new Date() }
        const finalNotes = notes.map(n => n.id === selectedNote.id ? finalNote : n)
        setNotes(finalNotes)
        setSelectedNote(finalNote)
        console.log("[InstantApp] ✅ Note manually saved to relays")
      } else {
        console.error("[InstantApp] Failed to manually save to relays:", result.error)
      }
    } catch (error) {
      console.error("[InstantApp] Error manually saving to relays:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading notes from relays...</p>
          <p className="text-sm text-muted-foreground mt-2">This should be instant like nostrudel</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            >
              {isMobileSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            
            <h1 className="text-xl font-bold">Nostr Journal (Instant)</h1>
            
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-green-500" />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshFromRelays}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              
              {lastLoadTime && (
                <span className="text-xs text-muted-foreground">
                  Loaded {lastLoadTime.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar - Note List */}
        <div className={`w-80 border-r border-border bg-card md:block ${isMobileSidebarOpen ? 'block' : 'hidden'}`}>
          <div className="p-4 border-b border-border">
            <Button onClick={createNote} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              New Note
            </Button>
          </div>
          
          <div className="overflow-y-auto h-[calc(100vh-145px)]">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`p-4 border-b border-border cursor-pointer hover:bg-accent ${
                  selectedNote?.id === note.id ? 'bg-accent' : ''
                }`}
                onClick={() => {
                  setSelectedNote(note)
                  setIsMobileSidebarOpen(false)
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{note.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {note.content.slice(0, 100)}
                      {note.content.length > 100 && '...'}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1 ml-2">
                    {note.eventId ? (
                      <Cloud className="h-3 w-3 text-green-500" />
                    ) : (
                      <CloudOff className="h-3 w-3 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {notes.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p>No notes found on relays.</p>
                <p className="text-sm mt-2">Create your first note to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col">
          {selectedNote ? (
            <div className="flex-1 flex flex-col">
              {/* Note Header */}
              <div className="p-4 border-b border-border bg-card">
                <div className="flex items-center justify-between">
                  <Input
                    value={selectedNote.title}
                    onChange={(e) => updateNote({ ...selectedNote, title: e.target.value })}
                    className="text-lg font-semibold border-none bg-transparent p-0 focus-visible:ring-0"
                    placeholder="Note title..."
                  />
                  
                  <div className="flex items-center gap-2">
                    {selectedNote.eventId && (
                      <div className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs">
                        <Cloud className="h-3 w-3 mr-1" />
                        On Relays
                      </div>
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveNow}
                      title="Save now (auto-saves after 3 seconds)"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteNote(selectedNote)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Note Content */}
              <div className="flex-1 p-4">
                <Textarea
                  value={selectedNote.content}
                  onChange={(e) => updateNote({ ...selectedNote, content: e.target.value })}
                  placeholder="Start writing... (auto-saves to relays)"
                  className="min-h-full border-none bg-transparent resize-none focus-visible:ring-0 text-base leading-relaxed"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">No note selected</h2>
                <p className="text-muted-foreground mb-4">Create a new note or select an existing one to get started.</p>
                <Button onClick={createNote}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Note
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
