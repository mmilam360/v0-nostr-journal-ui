'use client'

import { useState, useEffect } from "react"
import {
  Menu,
  X,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Settings,
  LogOut,
  User,
  Copy,
  Check,
  Plus,
  Trash2,
  Sun,
  Moon,
  Zap,
} from "lucide-react"
import TagsPanel from "@/components/tags-panel"
import NoteList from "@/components/note-list"
import Editor from "@/components/editor"
import PublishModal from "@/components/publish-modal"
import PublishConfirmationModal from "@/components/publish-confirmation-modal"
import DeleteConfirmationModal from "@/components/delete-confirmation-modal"
import ProfilePage from "@/components/profile-page"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createNostrEvent, publishToNostr } from "@/lib/nostr-publish"
import { loadEncryptedNotes, saveEncryptedNotes } from "@/lib/nostr-crypto"
import { smartSyncNotes, sanitizeNotes } from "@/lib/nostr-sync-fixed"
import { ConnectionStatus } from "@/components/connection-status"
import { RelayManager } from "@/components/relay-manager"
import { DiagnosticPage } from "@/components/diagnostic-page"
import { ThemeToggle } from "@/components/theme-toggle"
import { getDefaultRelays } from "@/lib/relay-manager"
import { DonationModal } from "@/components/donation-modal-proper"
import { setActiveSigner } from "@/lib/signer-connector"
import { createDirectEventManager, type DirectEventManager } from "@/lib/direct-event-manager"

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date
  lastModified: Date
  lastSynced?: Date
  eventId?: string // Nostr event ID for verification
  eventKind?: number // Track which kind was used (30078 or 31078)
}

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "remote"
  nsec?: string
  privateKey?: string
  clientSecretKey?: Uint8Array | string
  bunkerPubkey?: string
  sessionData?: any // For nostr-signer-connector session management
}

interface SimplifiedMainAppProps {
  authData: AuthData
  onLogout: () => void
}

export function SimplifiedMainApp({ authData, onLogout }: SimplifiedMainAppProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [selectedTag, setSelectedTag] = useState<string>("all")
  const [tags, setTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false)
  const [noteToPublish, setNoteToPublish] = useState<Note | null>(null)
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
  const [showRelaysInDropdown, setShowRelaysInDropdown] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [npub, setNpub] = useState<string>("")
  const [relays, setRelays] = useState<string[]>([])
  const [newRelay, setNewRelay] = useState("")
  const [profilePicture, setProfilePicture] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")
  const [showDonationModal, setShowDonationModal] = useState(false)
  
  // Direct event manager
  const [eventManager] = useState<DirectEventManager>(() => createDirectEventManager())

  // Load user notes on mount
  useEffect(() => {
    const loadUserNotes = async () => {
      console.log("[SimplifiedMainApp] Loading user notes...")
      setIsLoading(true)

      try {
        // Set up remote signer if needed
        if (authData.authMethod === 'remote' && authData.sessionData) {
          console.log("[SimplifiedMainApp] Setting up remote signer from session data")
          try {
            const { resumeNip46Session } = await import('@/lib/signer-connector')
            await resumeNip46Session(authData.sessionData)
            console.log("[SimplifiedMainApp] ✅ Remote signer resumed successfully")
          } catch (error) {
            console.error("[SimplifiedMainApp] ❌ Failed to resume remote signer:", error)
          }
        }

        // Load from local storage first
        const localNotes = await loadEncryptedNotes(authData.pubkey)
        console.log("[SimplifiedMainApp] Loaded", localNotes.length, "notes from local storage")

        // Add sync status to notes
        const notesWithStatus = localNotes.map((note) => ({
          ...note,
          syncStatus: note.eventId ? ("synced" as const) : ("local" as const),
        }))

        setNotes(notesWithStatus)
        setIsLoading(false)

        // Now sync with network
        console.log("[SimplifiedMainApp] Starting network sync...")
        setSyncStatus("syncing")

        try {
          const syncResult = await smartSyncNotes(notesWithStatus, deletedNotes, authData)
          const validatedSyncNotes = sanitizeNotes(syncResult.notes)

          if (validatedSyncNotes.length > 0 || notesWithStatus.length === 0) {
            setNotes(validatedSyncNotes)
            setDeletedNotes(syncResult.deletedNotes)
            setSyncStatus(syncResult.synced ? "synced" : "error")
            setConnectionError(syncResult.errors.length > 0 ? syncResult.errors[0] : null)

            if (syncResult.synced) {
              setLastSyncTime(new Date())
              await saveEncryptedNotes(authData.pubkey, validatedSyncNotes)
            }

            // Update tags
            const finalTags = new Set<string>()
            validatedSyncNotes.forEach((note) => {
              note.tags.forEach((tag) => finalTags.add(tag))
            })
            setTags(Array.from(finalTags))

            console.log("[SimplifiedMainApp] Initial load complete:", {
              total: validatedSyncNotes.length,
              synced: syncResult.syncedCount,
              failed: syncResult.failedCount,
            })
          } else {
            console.warn("[SimplifiedMainApp] Sync returned no valid notes, keeping local data")
            setSyncStatus("error")
            setConnectionError("Sync returned invalid data")
          }
        } catch (syncError) {
          console.error("[SimplifiedMainApp] Network sync failed, keeping local notes:", syncError)
          setSyncStatus("error")
          setConnectionError(syncError instanceof Error ? syncError.message : "Sync failed")
        }
      } catch (error) {
        console.error("[SimplifiedMainApp] Error loading notes:", error)
        setSyncStatus("error")
        setConnectionError(error instanceof Error ? error.message : "Load failed")
        setNotes([])
        setIsLoading(false)
      }
    }

    if (authData.pubkey) {
      loadUserNotes()
    }
  }, [authData])

  // Auto-save and sync logic
  useEffect(() => {
    const saveNotes = async () => {
      if (isLoading || syncStatus === "syncing") return

      console.log("[SimplifiedMainApp] Auto-saving notes...")
      setSyncStatus("syncing")

      try {
        // Save locally first
        await saveEncryptedNotes(authData.pubkey, notes)

        // Process any queued operations
        await eventManager.processQueue(authData)

        // Perform full sync
        const syncResult = await smartSyncNotes(notes, deletedNotes, authData)
        const validatedNotes = sanitizeNotes(syncResult.notes)

        setNotes(validatedNotes)
        setDeletedNotes(syncResult.deletedNotes)
        setSyncStatus(syncResult.synced ? "synced" : "error")
        setLastSyncTime(new Date())

        console.log("[SimplifiedMainApp] Auto-save complete")
      } catch (error) {
        console.error("[SimplifiedMainApp] Auto-save failed:", error)
        setSyncStatus("error")
      }
    }

    let timeoutId: NodeJS.Timeout | null = null

    if (!isLoading && needsSync && syncStatus !== "syncing") {
      timeoutId = setTimeout(saveNotes, 2000)
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [needsSync, isLoading, syncStatus, authData, notes, deletedNotes])

  const handleCreateNote = async () => {
    console.log("[SimplifiedMainApp] Creating new note...")
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

    // Add to UI immediately
    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    setSelectedNote(newNote)

    // Save locally immediately
    await saveEncryptedNotes(authData.pubkey, updatedNotes)

    // Queue for network sync
    eventManager.queueOperation({
      type: 'create',
      note: newNote
    })

    setNeedsSync(true)
    console.log("[SimplifiedMainApp] New note created:", newNote.id)
  }

  const handleUpdateNote = async (updatedNote: Note) => {
    console.log("[SimplifiedMainApp] Updating note:", updatedNote.id)

    const optimisticNote = {
      ...updatedNote,
      lastModified: new Date(),
    }

    setNotes(notes.map((note) => (note.id === updatedNote.id ? optimisticNote : note)))
    setSelectedNote(optimisticNote)

    // Save locally immediately
    const updatedNotes = notes.map((note) => (note.id === updatedNote.id ? optimisticNote : note))
    await saveEncryptedNotes(authData.pubkey, updatedNotes)

    // Queue for network sync
    eventManager.queueOperation({
      type: 'update',
      note: optimisticNote
    })

    setNeedsSync(true)
    console.log("[SimplifiedMainApp] ✅ Note updated and queued for sync")

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

  const handleDeleteNote = (note: Note) => {
    setNoteToDelete(note)
    setShowDeleteConfirmation(true)
  }

  const handleConfirmDelete = async () => {
    if (!noteToDelete) return

    console.log("[SimplifiedMainApp] Deleting note:", noteToDelete.title)

    // Remove from UI immediately
    const updatedNotes = notes.filter((note) => note.id !== noteToDelete.id)
    setNotes(updatedNotes)
    setSelectedNote(null)

    // Save locally immediately
    await saveEncryptedNotes(authData.pubkey, updatedNotes)

    // Add to deleted notes
    const updatedDeletedNotes = [
      ...deletedNotes,
      { id: noteToDelete.id, deletedAt: new Date() }
    ]
    setDeletedNotes(updatedDeletedNotes)

    // Queue for network sync
    eventManager.queueOperation({
      type: 'delete',
      noteId: noteToDelete.id
    })

    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
    setNeedsSync(true)
    
    console.log("[SimplifiedMainApp] ✅ Note deleted and queued for sync")
  }

  const handleManualSync = async () => {
    console.log("[SimplifiedMainApp] Manual sync requested")
    setSyncStatus("syncing")

    try {
      // Process any queued operations first
      await eventManager.processQueue(authData)

      // Perform full sync
      const syncResult = await smartSyncNotes(notes, deletedNotes, authData)
      const validatedNotes = sanitizeNotes(syncResult.notes)

      setNotes(validatedNotes)
      setDeletedNotes(syncResult.deletedNotes)
      setSyncStatus(syncResult.synced ? "synced" : "error")
      
      if (syncResult.synced) {
        setLastSyncTime(new Date())
        await saveEncryptedNotes(authData.pubkey, validatedNotes)
      }
    } catch (error) {
      console.error("[SimplifiedMainApp] Manual sync failed:", error)
      setSyncStatus("error")
    }
  }

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

  const handleLogout = async () => {
    console.log("[SimplifiedMainApp] User logging out...")

    // Process any remaining operations
    try {
      await eventManager.processQueue(authData)
      console.log("[SimplifiedMainApp] Processed remaining operations")
    } catch (error) {
      console.error("[SimplifiedMainApp] Error processing operations:", error)
    }

    // Clear signer connection
    try {
      const { clearActiveSigner } = await import('@/lib/signer-connector')
      clearActiveSigner()
      console.log("[SimplifiedMainApp] Cleared signer connection")
    } catch (error) {
      console.error("[SimplifiedMainApp] Error clearing signer:", error)
    }

    onLogout()
  }

  // Filter and sort notes
  const filteredNotes = selectedTag === "all" 
    ? notes 
    : selectedTag === "trash"
      ? []
      : notes.filter((note) => note.tags.includes(selectedTag || ""))
  
  const sortedNotes = filteredNotes.sort((a, b) => 
    new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
        w-80 bg-card border-r border-border
        transform transition-transform duration-300 ease-in-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Nostr Journal</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="lg:hidden"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Controls */}
          <div className="p-4 space-y-4">
            <Button onClick={handleCreateNote} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              New Note
            </Button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background"
              />
            </div>
          </div>

          {/* Tags Panel */}
          <div className="flex-1 overflow-hidden">
            <TagsPanel
              tags={tags}
              selectedTag={selectedTag}
              onTagSelect={setSelectedTag}
              notes={notes}
              onNotesUpdate={setNotes}
            />
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border">
            <ConnectionStatus onRetry={handleManualSync} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="w-4 h-4" />
            </Button>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {sortedNotes.length} note{sortedNotes.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs cursor-pointer hover:bg-secondary/70 transition-colors"
                 onClick={handleManualSync}
                 title="Click to sync manually">
              {getSyncStatusIcon()}
              <span className="text-muted-foreground">{getSyncStatusText()}</span>
            </div>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowProfile(true)}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRelayManager(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Relays
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDiagnostics(true)}>
                  <Zap className="w-4 h-4 mr-2" />
                  Diagnostics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {selectedNote ? (
            <div className="h-full">
              <Editor
                note={selectedNote}
                onUpdateNote={handleUpdateNote}
                onPublishNote={() => {}}
                onPublishHighlight={() => {}}
                onDeleteNote={handleDeleteNote}
                authData={authData}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p>Select a note to start editing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleConfirmDelete}
        noteTitle={noteToDelete?.title || ""}
      />

      <ProfilePage
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        pubkey={authData.pubkey}
        authMethod={authData.authMethod}
        npub={npub}
        relays={relays}
        profilePicture={profilePicture}
        displayName={displayName}
        onNpubCopy={() => setCopiedNpub(true)}
        copiedNpub={copiedNpub}
      />

      <RelayManager
        isOpen={showRelayManager}
        onClose={() => setShowRelayManager(false)}
        relays={relays}
        setRelays={setRelays}
        newRelay={newRelay}
        setNewRelay={setNewRelay}
      />

      <DiagnosticPage
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        authData={authData}
        notes={notes}
        deletedNotes={deletedNotes}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        connectionError={connectionError}
      />

      <DonationModal
        isOpen={showDonationModal}
        onClose={() => setShowDonationModal(false)}
      />
    </div>
  )
}

