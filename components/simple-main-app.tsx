"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { loadEncryptedNotes } from "@/lib/nostr-crypto"
import { fetchNotesFromNostr, saveNoteToNostr, deleteNoteFromNostr } from "@/lib/simple-nostr-storage"

interface SimpleMainAppProps {
  authData: any
  onLogout: () => void
}

export function SimpleMainApp({ authData, onLogout }: SimpleMainAppProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // Load notes on startup
  useEffect(() => {
    loadUserNotes()
  }, [authData])

  const loadUserNotes = async () => {
    try {
      setIsLoading(true)
      console.log("[SimpleApp] Loading notes...")
      
      // Load from localStorage first (fast)
      const localNotes = await loadEncryptedNotes(authData.pubkey)
      setNotes(localNotes)
      setSelectedNote(localNotes[0] || null)
      
      console.log(`[SimpleApp] Loaded ${localNotes.length} local notes`)
      
      // Then sync with Nostr in background
      syncWithNostr()
      
    } catch (error) {
      console.error("[SimpleApp] Error loading notes:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const syncWithNostr = async () => {
    try {
      setIsSyncing(true)
      console.log("[SimpleApp] Syncing with Nostr...")
      console.log("[SimpleApp] User pubkey:", authData.pubkey)
      
      const remoteNotes = await fetchNotesFromNostr(authData)
      console.log(`[SimpleApp] Fetched ${remoteNotes.length} remote notes from relays`)
      
      if (remoteNotes.length === 0) {
        console.log("[SimpleApp] No notes found on relays - this might be the issue!")
        console.log("[SimpleApp] Checking if notes were properly published...")
        
        // Show alert to user
        alert(`No notes found on relays! This means either:
1. Notes weren't properly published to relays
2. The pubkey is wrong: ${authData.pubkey}
3. The relay query is not working

Check console for detailed logs.`)
      }
      
      // Simple merge: remote notes take precedence if they exist
      const mergedNotes = [...notes]
      
      for (const remoteNote of remoteNotes) {
        const existingIndex = mergedNotes.findIndex(n => n.id === remoteNote.id)
        if (existingIndex >= 0) {
          // Update existing note with remote data
          mergedNotes[existingIndex] = {
            ...mergedNotes[existingIndex],
            ...remoteNote,
            eventId: remoteNote.eventId,
            eventKind: remoteNote.eventKind,
            lastSynced: new Date()
          }
        } else {
          // Add new note from remote
          mergedNotes.push(remoteNote)
        }
      }
      
      // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
      setNotes(mergedNotes)
      setLastSyncTime(new Date())
      
      console.log(`[SimpleApp] Sync complete: ${mergedNotes.length} total notes`)
      
      if (remoteNotes.length > 0) {
        console.log("[SimpleApp] ✅ Successfully synced notes from relays!")
      }
      
    } catch (error) {
      console.error("[SimpleApp] Sync error:", error)
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSyncing(false)
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

    const updatedNotes = [...notes, newNote]
    setNotes(updatedNotes)
    setSelectedNote(newNote)
    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
  }

  const updateNote = async (updatedNote: Note) => {
    const updatedNotes = notes.map(note => 
      note.id === updatedNote.id ? { ...updatedNote, lastModified: new Date() } : note
    )
    setNotes(updatedNotes)
    setSelectedNote(updatedNote)
    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
  }

  const deleteNote = async (noteToDelete: Note) => {
    if (!confirm(`Delete "${noteToDelete.title}"?`)) return
    
    try {
      // Remove from local state immediately
      const updatedNotes = notes.filter(note => note.id !== noteToDelete.id)
      setNotes(updatedNotes)
      setSelectedNote(updatedNotes[0] || null)
      // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
      
      // Delete from Nostr if it has an eventId
      if (noteToDelete.eventId) {
        await deleteNoteFromNostr(noteToDelete, authData)
      }
      
    } catch (error) {
      console.error("[SimpleApp] Error deleting note:", error)
    }
  }

  const saveToNostr = async (note: Note) => {
    try {
      console.log("[SimpleApp] Saving to Nostr:", note.title)
      const result = await saveNoteToNostr(note, authData)
      
      if (result.success) {
        // Update note with eventId
        const updatedNote = { ...note, eventId: result.eventId, lastSynced: new Date() }
        const updatedNotes = notes.map(n => n.id === note.id ? updatedNote : n)
        setNotes(updatedNotes)
        setSelectedNote(updatedNote)
        // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
        
        console.log("[SimpleApp] Successfully saved to Nostr")
      } else {
        console.error("[SimpleApp] Failed to save to Nostr:", result.error)
      }
    } catch (error) {
      console.error("[SimpleApp] Error saving to Nostr:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading your notes...</p>
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
            
            <h1 className="text-xl font-bold">Nostr Journal</h1>
            
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              ) : lastSyncTime ? (
                <Cloud className="h-4 w-4 text-green-500" />
              ) : (
                <CloudOff className="h-4 w-4 text-gray-500" />
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={syncWithNostr}
                disabled={isSyncing}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
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
                <p>No notes yet.</p>
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
                      <Badge variant="secondary" className="text-xs">
                        <Cloud className="h-3 w-3 mr-1" />
                        Synced
                      </Badge>
                    )}
                    
                    <Button
                      size="sm"
                      onClick={() => saveToNostr(selectedNote)}
                      disabled={!selectedNote.eventId}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {selectedNote.eventId ? 'Resync' : 'Sync'}
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
                  placeholder="Start writing..."
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
