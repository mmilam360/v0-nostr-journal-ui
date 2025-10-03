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
import { syncNotes } from "@/lib/nostr-storage"
import { RelayManager } from "@/components/relay-manager"
import { ThemeToggle } from "@/components/theme-toggle"

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
  privateKey?: string
  signer?: any
  clientSecretKey?: Uint8Array
  bunkerPubkey?: string
  bunkerUri?: string
  relays?: string[]
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

  useEffect(() => {
    const loadUserNotes = async () => {
      console.log("[v0] Loading notes for user:", authData.pubkey)
      setIsLoading(true)
      setSyncStatus("syncing")

      try {
        const localNotes = await loadEncryptedNotes(authData.pubkey)
        console.log("[v0] Loaded", localNotes.length, "local notes")

        const notesWithStatus = localNotes.map((note) => ({
          ...note,
          syncStatus: note.syncStatus || ("local" as const),
        }))

        console.log("[v0] Syncing with Nostr network...")

        const syncResult = await syncNotes(notesWithStatus, deletedNotes, authData)

        const syncedNotes = syncResult.notes.map((note) => ({
          ...note,
          syncStatus: syncResult.synced ? ("synced" as const) : ("error" as const),
        }))

        setNotes(syncedNotes)
        setDeletedNotes(syncResult.deletedNotes)
        setSyncStatus(syncResult.synced ? "synced" : "error")
        if (syncResult.synced) {
          setLastSyncTime(new Date())
        }

        console.log("[v0] Sync completed:", syncResult.synced ? "success" : "failed")

        const allTags = new Set<string>()
        syncedNotes.forEach((note) => {
          note.tags.forEach((tag) => allTags.add(tag))
        })
        setTags(Array.from(allTags))
      } catch (error) {
        console.error("[v0] Error loading notes:", error)
        setSyncStatus("error")
      } finally {
        setIsLoading(false)
      }
    }

    if (authData.pubkey) {
      loadUserNotes()
    }
  }, [authData]) // Updated to use the entire authData object

  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (syncStatus === "syncing" || needsSync) return

      console.log("[v0] Performing background sync...")
      setSyncStatus("syncing")

      try {
        const syncResult = await syncNotes(notes, deletedNotes, authData)

        if (
          JSON.stringify(syncResult.notes) !== JSON.stringify(notes) ||
          JSON.stringify(syncResult.deletedNotes) !== JSON.stringify(deletedNotes)
        ) {
          console.log("[v0] Background sync found changes")

          const syncedNotes = syncResult.notes.map((note) => ({
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
  }, [syncStatus, needsSync, authData, notes, deletedNotes])

  useEffect(() => {
    if (!isLoading && needsSync && syncStatus !== "syncing") {
      const saveNotes = async () => {
        console.log("[v0] Triggering sync after changes...")

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
            const result = await syncNotes(notes, deletedNotes, authData)

            if (
              JSON.stringify(result.notes) !== JSON.stringify(notes) ||
              JSON.stringify(result.deletedNotes) !== JSON.stringify(deletedNotes)
            ) {
              console.log("[v0] Sync returned changes, updating state")

              const syncedNotes = result.notes.map((note) => ({
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
  }, [needsSync, authData, isLoading, syncStatus, deletedNotes, notes])

  const handleCreateNote = () => {
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
      syncStatus: "local",
    }

    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    setSelectedNote(newNote)
    setNeedsSync(true)

    console.log("[v0] New note created:", newNote.id, "Total notes:", updatedNotes.length)
  }

  const handleUpdateNote = (updatedNote: Note) => {
    console.log("[v0] Updating note:", updatedNote.id)

    const noteWithTimestamp = {
      ...updatedNote,
      lastModified: new Date(),
      lastSynced: undefined,
      syncStatus: "local" as const,
    }

    setNotes(notes.map((note) => (note.id === updatedNote.id ? noteWithTimestamp : note)))
    setSelectedNote(noteWithTimestamp)
    setNeedsSync(true)

    const allTags = new Set<string>()
    notes.forEach((note) => {
      if (note.id === updatedNote.id) {
        noteWithTimestamp.tags.forEach((tag) => allTags.add(tag))
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

  const handleLogout = () => {
    console.log("[v0] User logging out, notes will remain encrypted in storage")
    onLogout()
  }

  const handleDeleteNote = async (noteToDelete: Note) => {
    console.log("[v0] Delete requested for note:", noteToDelete.id)

    // Step 1: Optimistically update the UI - remove the note from local state
    const updatedNotes = notes.filter((note) => note.id !== noteToDelete.id)
    setNotes(updatedNotes)

    if (selectedNote?.id === noteToDelete.id) {
      setSelectedNote(null)
    }

    // Update tags
    const allTags = new Set<string>()
    updatedNotes.forEach((note) => {
      note.tags.forEach((tag) => allTags.add(tag))
    })
    setTags(Array.from(allTags))

    // Step 2: In the background, publish the deletion event to the network
    try {
      console.log("[v0] Publishing NIP-09 deletion event to Nostr network...")
      const { deleteNoteOnNostr } = await import("@/lib/nostr-storage")
      await deleteNoteOnNostr(noteToDelete, authData)
      console.log("[v0] Successfully published deletion event to Nostr.")
    } catch (error) {
      console.error("[v0] Failed to publish deletion event:", error)
      // Note: We don't re-add the note to UI even if deletion fails
      // The note is already removed locally, which is the primary concern
    }

    // Update deleted notes tracking
    const deletedNote = {
      id: noteToDelete.id,
      deletedAt: new Date(),
    }
    setDeletedNotes([...deletedNotes, deletedNote])
    setNeedsSync(true)
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
    setSyncStatus("syncing")
    try {
      const syncResult = await syncNotes(notes, deletedNotes, authData)

      const syncedNotes = syncResult.notes.map((note) => ({
        ...note,
        syncStatus: syncResult.synced ? ("synced" as const) : ("error" as const),
      }))

      setNotes(syncedNotes)
      setDeletedNotes(syncResult.deletedNotes)
      setSyncStatus(syncResult.synced ? "synced" : "error")
      if (syncResult.synced) {
        setLastSyncTime(new Date())
      }
    } catch (error) {
      console.error("[v0] Manual sync failed:", error)
      setSyncStatus("error")
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
          </div>
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

        {showRelayManager && <RelayManager onClose={() => setShowRelayManager(false)} />}
      </div>

      <DonationBubble />
    </div>
  )
}
