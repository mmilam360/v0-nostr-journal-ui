"use client"

import { useState, useEffect } from "react"
import { LogOut, Menu, X, CloudOff, RefreshCw, User, CheckCircle2, Loader2, AlertCircle, Settings } from "lucide-react"
import TagsPanel from "@/components/tags-panel"
import NoteList from "@/components/note-list"
import Editor from "@/components/editor"
import PublishModal from "@/components/publish-modal"
import PublishConfirmationModal from "@/components/publish-confirmation-modal"
import DeleteConfirmationModal from "@/components/delete-confirmation-modal"
import DonationBubble from "@/components/donation-bubble"
import ProfilePage from "@/components/profile-page"
import { Button } from "@/components/ui/button"
import { saveEncryptedNotes, loadEncryptedNotes } from "@/lib/nostr-crypto"
import { createNostrEvent, publishToNostr } from "@/lib/nostr-publish"
import { cleanupSigner } from "@/lib/signer-manager"
import { smartSyncNotes, saveAndSyncNote } from "@/lib/nostr-sync-fixed"
import { sanitizeNotes } from "@/lib/data-validators"
import { ErrorBoundary } from "@/components/error-boundary"
import { RelayManager } from "@/components/relay-manager"
import { ThemeToggle } from "@/components/theme-toggle"
import { ConnectionStatus } from "@/components/connection-status"
import { DiagnosticPage } from "@/components/diagnostic-page"

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date
  lastModified: Date
  lastSynced?: Date
  syncStatus?: "local" | "syncing" | "synced" | "error"
  syncError?: string
}

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "remote"
  nsec?: string
  privateKey?: string  // Hex string of private key (for nsec method)
  signer?: any
  clientSecretKey?: Uint8Array  // For remote signer
  bunkerPubkey?: string  // For remote signer
  bunkerUri?: string  // For remote signer
  relays?: string[]  // For remote signer
}

interface MainAppProps {
  authData: AuthData
  onLogout: () => void
}

export function MainApp({ authData, onLogout }: MainAppProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>("all")
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false)
  const [noteToPublish, setNoteToPublish] = useState<Note | null>(null)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishedEventId, setPublishedEventId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline" | "error">("offline")
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [needsSync, setNeedsSync] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null)
  const [deletedNotes, setDeletedNotes] = useState<{ id: string; deletedAt: Date }[]>([])
  const [showProfile, setShowProfile] = useState(false)
  const [showRelayManager, setShowRelayManager] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const retryConnection = async () => {
    console.log("[v0] 🔄 Retrying connection...")
    setConnectionError(null)
    setSyncStatus("syncing")
    
    try {
      const syncResult = await smartSyncNotes(notes, deletedNotes, authData)
      
      setNotes(syncResult.notes)
      setDeletedNotes(syncResult.deletedNotes)
      setSyncStatus(syncResult.synced ? "synced" : "error")
      setConnectionError(syncResult.errors.length > 0 ? syncResult.errors[0] : null)
      
      if (syncResult.synced) {
        setLastSyncTime(new Date())
      }
    } catch (error) {
      console.error("[v0] Retry failed:", error)
      setSyncStatus("error")
      setConnectionError(error instanceof Error ? error.message : "Retry failed")
    }
  }

  const retrySyncFailedNotes = async () => {
    const failedNotes = notes.filter(n => n.syncStatus === 'error')
    
    if (failedNotes.length === 0) {
      return
    }

    console.log("[v0] Retrying", failedNotes.length, "failed syncs")
    setSyncStatus("syncing")

    for (const note of failedNotes) {
      try {
        const result = await saveAndSyncNote(note, authData)
        setNotes(notes.map(n => n.id === note.id ? result.note : n))
        
        if (result.success) {
          await saveEncryptedNotes(authData.pubkey, notes.map(n => n.id === note.id ? result.note : n))
        }
      } catch (error) {
        console.error("[v0] Retry failed for:", note.title, error)
      }
    }

    setSyncStatus("synced")
    setLastSyncTime(new Date())
  }

  useEffect(() => {
    const loadUserNotes = async () => {
      console.log("[v0] Loading notes for user:", authData.pubkey)
      setIsLoading(true)
      setSyncStatus("syncing")

      try {
        // Load from local storage first
        const rawLocalNotes = await loadEncryptedNotes(authData.pubkey)
        console.log("[v0] Raw local notes loaded:", rawLocalNotes.length)

        // CRITICAL: Validate and sanitize all notes
        const validatedNotes = sanitizeNotes(rawLocalNotes)
        console.log("[v0] Validated notes:", validatedNotes.length)

        const notesWithStatus = validatedNotes.map((note) => ({
          ...note,
          syncStatus: note.syncStatus || ("local" as const),
        }))

        // CRITICAL: Show local notes immediately (don't wait for sync)
        setNotes(notesWithStatus)
        
        // Extract tags
        const allTags = new Set<string>()
        notesWithStatus.forEach((note) => {
          note.tags.forEach((tag) => allTags.add(tag))
        })
        setTags(Array.from(allTags))
        
        setIsLoading(false)

        // Now sync in background (with error protection)
        console.log("[v0] Starting background sync...")
        
        try {
          const syncResult = await smartSyncNotes(notesWithStatus, deletedNotes, authData)

          // CRITICAL: Validate sync results before updating state
          const validatedSyncNotes = sanitizeNotes(syncResult.notes)
          
          // CRITICAL: Only update if we got valid notes
          if (validatedSyncNotes.length > 0 || notesWithStatus.length === 0) {
            setNotes(validatedSyncNotes)
            setDeletedNotes(syncResult.deletedNotes)
            setSyncStatus(syncResult.synced ? "synced" : "error")
            setConnectionError(syncResult.errors.length > 0 ? syncResult.errors[0] : null)
            
            if (syncResult.synced) {
              setLastSyncTime(new Date())
              // Save synced state to local storage
              await saveEncryptedNotes(authData.pubkey, validatedSyncNotes)
            }

            // Update tags again
            const finalTags = new Set<string>()
            validatedSyncNotes.forEach((note) => {
              note.tags.forEach((tag) => finalTags.add(tag))
            })
            setTags(Array.from(finalTags))

            console.log("[v0] Initial load complete:", {
              total: validatedSyncNotes.length,
              synced: syncResult.syncedCount,
              failed: syncResult.failedCount
            })
          } else {
            console.warn("[v0] Sync returned no valid notes, keeping local data")
            setSyncStatus("error")
            setConnectionError("Sync returned invalid data")
          }

        } catch (syncError) {
          console.error("[v0] Background sync failed, keeping local notes:", syncError)
          setSyncStatus("error")
          setConnectionError(syncError instanceof Error ? syncError.message : "Sync failed")
          // CRITICAL: Keep the local notes we already loaded
        }

      } catch (error) {
        console.error("[v0] Error loading notes:", error)
        setSyncStatus("error")
        setConnectionError(error instanceof Error ? error.message : "Failed to load notes")
        setIsLoading(false)
        // CRITICAL: Set empty array instead of leaving undefined
        setNotes([])
      }
    }

    if (authData.pubkey) {
      loadUserNotes()
    }
  }, [authData.pubkey]) // Only depend on pubkey, not entire authData object

  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (syncStatus === "syncing" || needsSync) return

      console.log("[v0] Performing background sync...")
      setSyncStatus("syncing")

      try {
        const syncResult = await smartSyncNotes(notes, deletedNotes, authData)

        // Validate results
        const validatedNotes = sanitizeNotes(syncResult.notes)

        // Only update if we got different valid data
        if (validatedNotes.length > 0 && JSON.stringify(validatedNotes) !== JSON.stringify(notes)) {
          console.log("[v0] Background sync found changes")

          const syncedNotes = validatedNotes.map((note) => ({
            ...note,
            syncStatus: syncResult.synced ? ("synced" as const) : ("error" as const),
          }))

          setNotes(syncedNotes)
          setDeletedNotes(syncResult.deletedNotes)
        }

        setSyncStatus(syncResult.synced ? "synced" : "error")
        if (syncResult.synced) {
          setLastSyncTime(new Date())
        }
      } catch (error) {
        console.error("[v0] Background sync failed:", error)
        setSyncStatus("error")
      }
    }, 60000)

    return () => clearInterval(syncInterval)
  }, [syncStatus, needsSync]) // Removed notes/deletedNotes from deps to prevent loops

  useEffect(() => {
    if (!isLoading && needsSync && syncStatus !== "syncing") {
      const saveNotes = async () => {
        console.log("[v0] Triggering sync after changes...")

        // Save locally first (instant feedback)
        await saveEncryptedNotes(authData.pubkey, notes)

        if (notes.length > 0 || deletedNotes.length > 0) {
          try {
            setSyncStatus("syncing")

            setNotes((prev) =>
              prev.map((note) => ({
                ...note,
                syncStatus: "syncing" as const,
              })),
            )

            console.log("[v0] Syncing changes to Nostr...")
            const result = await smartSyncNotes(notes, deletedNotes, authData)

            // Validate results
            const validatedNotes = sanitizeNotes(result.notes)

            if (validatedNotes.length > 0 && JSON.stringify(validatedNotes) !== JSON.stringify(notes)) {
              console.log("[v0] Sync returned changes, updating state")

              const syncedNotes = validatedNotes.map((note) => ({
                ...note,
                syncStatus: result.synced ? ("synced" as const) : ("error" as const),
              }))

              setNotes(syncedNotes)
              setDeletedNotes(result.deletedNotes)
            }

            setSyncStatus(result.synced ? "synced" : "error")
            if (result.synced) {
              setLastSyncTime(new Date())
            }
          } catch (error) {
            console.error("[v0] Error syncing to Nostr:", error)
            setSyncStatus("error")

            setNotes((prev) =>
              prev.map((note) => ({
                ...note,
                syncStatus: "error" as const,
              })),
            )
          }
        }

        setNeedsSync(false)
      }

      const timeoutId = setTimeout(saveNotes, 2000)
      return () => clearTimeout(timeoutId)
    }
  }, [needsSync, isLoading, syncStatus]) // Removed notes/deletedNotes to prevent loops

  const handleCreateNote = async () => {
    console.log("[v0] Creating new note...")
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
      syncStatus: "syncing",
    }

    // Add to UI immediately
    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    setSelectedNote(newNote)

    // Save locally immediately
    await saveEncryptedNotes(authData.pubkey, updatedNotes)

    // Sync to Nostr in background
    try {
      const result = await saveAndSyncNote(newNote, authData)
      
      setNotes([result.note, ...notes])
      setSelectedNote(result.note)
      
      if (result.success) {
        const syncedNotes = [result.note, ...notes]
        await saveEncryptedNotes(authData.pubkey, syncedNotes)
        setLastSyncTime(new Date())
      } else {
        setConnectionError(result.error || "Failed to sync new note")
      }
    } catch (error) {
      console.error("[v0] Error syncing new note:", error)
      const errorNote = {
        ...newNote,
        syncStatus: "error" as const,
        syncError: error instanceof Error ? error.message : "Sync failed"
      }
      setNotes([errorNote, ...notes])
      setSelectedNote(errorNote)
    }

    console.log("[v0] New note created:", newNote.id)
  }

  const handleUpdateNote = async (updatedNote: Note) => {
    console.log("[v0] Updating note:", updatedNote.id)

    // Optimistic update - show changes immediately
    const optimisticNote = {
      ...updatedNote,
      lastModified: new Date(),
      syncStatus: "syncing" as const,
    }

    setNotes(notes.map((note) => (note.id === updatedNote.id ? optimisticNote : note)))
    setSelectedNote(optimisticNote)

    // Save to local storage immediately
    const updatedNotes = notes.map((note) => (note.id === updatedNote.id ? optimisticNote : note))
    await saveEncryptedNotes(authData.pubkey, updatedNotes)

    // Sync to Nostr in background
    try {
      const result = await saveAndSyncNote(optimisticNote, authData)
      
      // Update with final sync status
      setNotes(notes.map((note) => (note.id === updatedNote.id ? result.note : note)))
      setSelectedNote(result.note)
      
      if (result.success) {
        // Save successful sync to local storage
        const syncedNotes = notes.map((note) => (note.id === updatedNote.id ? result.note : note))
        await saveEncryptedNotes(authData.pubkey, syncedNotes)
        setLastSyncTime(new Date())
      } else {
        console.error("[v0] Sync failed:", result.error)
        setConnectionError(result.error || "Failed to sync note")
      }
    } catch (error) {
      console.error("[v0] Error syncing note:", error)
      const errorNote = {
        ...optimisticNote,
        syncStatus: "error" as const,
        syncError: error instanceof Error ? error.message : "Sync failed"
      }
      setNotes(notes.map((note) => (note.id === updatedNote.id ? errorNote : note)))
      setSelectedNote(errorNote)
    }

    // Update tags
    const allTags = new Set<string>()
    notes.forEach((note) => {
      if (note.id === updatedNote.id) {
        optimisticNote.tags.forEach((tag) => allTags.add(tag))
      } else {
        note.tags.forEach((tag) => allTags.add(tag))
      }
    })
    setTags(Array.from(allTags))
  }

  const handlePublishNote = (note: Note) => {
    setNoteToPublish(note)
    setShowPublishConfirmation(true)
  }

  const handleConfirmPublish = async () => {
    if (!noteToPublish) return

    try {
      console.log("[v0] Creating Nostr event for note:", noteToPublish.title)

      const event = await createNostrEvent(authData.pubkey, noteToPublish.content, noteToPublish.tags)

      console.log("[v0] Publishing event to Nostr relays...")
      const eventId = await publishToNostr(event, authData)

      console.log("[v0] Successfully published to Nostr with event ID:", eventId)

      setPublishedEventId(eventId)
      setShowPublishConfirmation(false)
      setShowPublishModal(true)
      setNoteToPublish(null)
    } catch (error) {
      console.error("[v0] Error publishing to Nostr:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      alert(`Failed to publish to Nostr: ${errorMessage}`)
      setShowPublishConfirmation(false)
      setNoteToPublish(null)
    }
  }

  const handleCancelPublish = () => {
    setShowPublishConfirmation(false)
    setNoteToPublish(null)
  }

  const handleLogout = async () => {
    console.log("[v0] User logging out, cleaning up signer connection...")
    
    // Clean up the remote signer connection
    await cleanupSigner()
    
    console.log("[v0] Notes will remain encrypted in storage")
    onLogout()
  }

  const handleDeleteNote = async (noteToDelete: Note) => {
    console.log("[v0] Delete requested for note:", noteToDelete.id)
    
    // Show confirmation modal instead of deleting immediately
    setNoteToDelete(noteToDelete)
    setShowDeleteConfirmation(true)
  }


  const handleConfirmDelete = async () => {
    if (!noteToDelete) return

    console.log("[v0] Deleting note:", noteToDelete.id, noteToDelete.title)

    // Step 1: Optimistically update the UI
    const updatedNotes = notes.filter((note) => note.id !== noteToDelete.id)
    console.log("[v0] Notes before delete:", notes.length, "after delete:", updatedNotes.length)

    setNotes(updatedNotes)

    if (selectedNote?.id === noteToDelete.id) {
      console.log("[v0] Clearing selected note as it was deleted")
      setSelectedNote(null)
    }

    // Update tags
    const allTags = new Set<string>()
    updatedNotes.forEach((note) => {
      note.tags.forEach((tag) => allTags.add(tag))
    })
    setTags(Array.from(allTags))

    // Step 2: Publish deletion event to Nostr
    try {
      console.log("[v0] Publishing NIP-09 deletion event to Nostr network...")
      const { deleteNoteOnNostr } = await import("@/lib/nostr-storage")
      await deleteNoteOnNostr(noteToDelete, authData)
      console.log("[v0] Successfully published deletion event to Nostr.")
    } catch (error) {
      console.error("[v0] Failed to publish deletion event:", error)
    }

    // Update deleted notes tracking
    const deletedNote = {
      id: noteToDelete.id,
      deletedAt: new Date(),
    }
    setDeletedNotes([...deletedNotes, deletedNote])
    setNeedsSync(true)
    console.log("[v0] Delete completed, triggering sync")

    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
  }

  const handlePublishHighlight = (note: Note, highlightedText: string) => {
    console.log("[v0] Publishing highlight:", highlightedText.substring(0, 50) + "...")

    const highlightNote = {
      ...note,
      content: highlightedText,
      title: `${note.title} (Highlight)`,
    }

    setNoteToPublish(highlightNote)
    setShowPublishConfirmation(true)
  }

  const filteredNotes =
    selectedTag === "all"
      ? notes
      : selectedTag === "trash"
        ? []
        : notes.filter((note) => note.tags.includes(selectedTag || ""))

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case "synced":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case "syncing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <CloudOff className="w-4 h-4 text-slate-500" />
    }
  }

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case "synced":
        return lastSyncTime ? `Synced ${lastSyncTime.toLocaleTimeString()}` : "Synced"
      case "syncing":
        return "Syncing..."
      case "error":
        return "Sync failed"
      default:
        return "Local only"
    }
  }

  const handleManualSync = async () => {
    console.log("[v0] Manual sync requested")
    setSyncStatus("syncing")
    
    try {
      const syncResult = await smartSyncNotes(notes, deletedNotes, authData)

      // Validate results
      const validatedNotes = sanitizeNotes(syncResult.notes)

      if (validatedNotes.length > 0) {
        const syncedNotes = validatedNotes.map((note) => ({
          ...note,
          syncStatus: syncResult.synced ? ("synced" as const) : ("error" as const),
        }))

        setNotes(syncedNotes)
        setDeletedNotes(syncResult.deletedNotes)
        setSyncStatus(syncResult.synced ? "synced" : "error")
        
        if (syncResult.synced) {
          setLastSyncTime(new Date())
          await saveEncryptedNotes(authData.pubkey, syncedNotes)
        }
        
        setConnectionError(syncResult.errors.length > 0 ? syncResult.errors[0] : null)
      } else {
        throw new Error("Sync returned no valid notes")
      }
    } catch (error) {
      console.error("[v0] Manual sync failed:", error)
      setSyncStatus("error")
      setConnectionError(error instanceof Error ? error.message : "Manual sync failed")
    }
  }

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your notes...</p>
          {authData.authMethod === "nsec" && (
            <p className="text-muted-foreground text-sm mt-2">Syncing with Nostr network...</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-background flex flex-col w-full">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsMobileSidebarOpen(true)}
            variant="ghost"
            size="sm"
            className="md:hidden text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Menu className="w-4 h-4" />
          </Button>

          {/* Nostr Journal Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/nostr-journal-logo.svg" 
              alt="Nostr Journal" 
              className="h-8 w-8 rounded-lg"
              onError={(e) => {
                // Fallback to placeholder if logo not found
                e.currentTarget.src = "/placeholder-logo.png"
              }}
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground">Nostr Journal</h1>
              <p className="text-xs text-muted-foreground">Your decentralized notes</p>
            </div>
          </div>

          <span className="text-muted-foreground text-xs">({notes.length} notes)</span>
          <span className="text-muted-foreground text-xs bg-muted px-2 py-1 rounded">
            {authData.authMethod === "extension" ? "Extension" : authData.authMethod === "remote" ? "Remote" : "nsec"}
          </span>

          <div className="flex items-center gap-2">
            {getSyncStatusIcon()}
            <span className="text-muted-foreground text-xs hidden lg:inline">{getSyncStatusText()}</span>
            {syncStatus !== "syncing" && (
              <Button
                onClick={handleManualSync}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-muted p-1"
                title="Manual sync"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            )}
            {notes.some(n => n.syncStatus === 'error') && (
              <Button
                onClick={retrySyncFailedNotes}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1"
                title={`Retry ${notes.filter(n => n.syncStatus === 'error').length} failed syncs`}
              >
                <RefreshCw className="w-3 h-3" />
                <span className="text-xs ml-1">{notes.filter(n => n.syncStatus === 'error').length}</span>
              </Button>
            )}
          </div>
          
          {/* Connection Status */}
          <ConnectionStatus 
            onRetry={retryConnection}
            className="text-xs"
          />
          
          {/* Connection Error Display */}
          {connectionError && (
            <div className="flex items-center gap-1 text-red-500 text-xs">
              <AlertCircle className="w-3 h-3" />
              <span className="truncate">{connectionError}</span>
              <Button
                onClick={() => setShowDiagnostics(true)}
                variant="ghost"
                size="sm"
                className="h-4 px-1 text-xs text-red-500 hover:text-red-700"
              >
                Diagnose
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowRelayManager(true)}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Manage Relays"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Relays</span>
          </Button>

          <ThemeToggle />

          <Button
            onClick={() => setShowProfile(true)}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <User className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Profile</span>
          </Button>

          <Button
            onClick={onLogout}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 relative w-full">
        <div className="hidden md:block">
          <TagsPanel
            tags={tags}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            pubkey={authData.pubkey}
            onLogout={onLogout}
          />
        </div>

        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-slate-800">
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <h2 className="text-white font-medium">Menu</h2>
                <Button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <TagsPanel
                tags={tags}
                selectedTag={selectedTag}
                onSelectTag={(tag) => {
                  setSelectedTag(tag)
                  setIsMobileSidebarOpen(false)
                }}
                pubkey={authData.pubkey}
                onLogout={onLogout}
              />
            </div>
          </div>
        )}

        <div className="flex flex-1 min-w-0 w-full">
          <div className="w-full md:w-80 border-r border-border">
            <NoteList
              notes={filteredNotes}
              selectedNote={selectedNote}
              onSelectNote={setSelectedNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
            />
          </div>

          <div className="hidden lg:block flex-1 w-full">
            <Editor
              note={selectedNote}
              onUpdateNote={handleUpdateNote}
              onPublishNote={handlePublishNote}
              onPublishHighlight={handlePublishHighlight}
              onDeleteNote={handleDeleteNote}
            />
          </div>
        </div>

        {selectedNote && (
          <div className="fixed inset-0 z-40 lg:hidden bg-slate-900">
            <div className="h-full">
              <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                <h2 className="text-foreground font-medium truncate">{selectedNote.title}</h2>
                <Button
                  onClick={() => setSelectedNote(null)}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Editor
                note={selectedNote}
                onUpdateNote={handleUpdateNote}
                onPublishNote={handlePublishNote}
                onPublishHighlight={handlePublishHighlight}
                onDeleteNote={handleDeleteNote}
              />
            </div>
          </div>
        )}

        {showPublishConfirmation && noteToPublish && (
          <PublishConfirmationModal
            note={noteToPublish}
            onConfirm={handleConfirmPublish}
            onCancel={handleCancelPublish}
          />
        )}

        {showPublishModal && <PublishModal eventId={publishedEventId} onClose={() => setShowPublishModal(false)} />}

        {showDeleteConfirmation && noteToDelete && (
          <DeleteConfirmationModal note={noteToDelete} onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />
        )}

        {showProfile && <ProfilePage authData={authData} onClose={() => setShowProfile(false)} />}

        {showRelayManager && (
          <RelayManager 
            onClose={() => setShowRelayManager(false)}
            onSave={(relays) => {
              console.log("[v0] 🔄 Relays updated:", relays)
              setShowRelayManager(false)
              // Clear relay cache to force reload
              localStorage.removeItem("nostr_user_relays")
            }}
          />
        )}

        {showDiagnostics && (
          <div className="fixed inset-0 z-50 bg-background">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Connection Diagnostics</h2>
              <Button
                onClick={() => setShowDiagnostics(false)}
                variant="ghost"
                size="sm"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <DiagnosticPage />
          </div>
        )}
      </div>

      <DonationBubble />
    </div>
    </ErrorBoundary>
  )
}
