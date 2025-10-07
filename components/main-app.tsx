"use client"

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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/lib/theme-provider"
import { Logo } from "./logo"
import { Input } from "@/components/ui/input"
import DonationBubble from "@/components/donation-bubble"
import { saveEncryptedNotes, loadEncryptedNotes } from "@/lib/nostr-crypto"
import { createNostrEvent, publishToNostr } from "@/lib/nostr-publish"
import { cleanupSigner } from "@/lib/signer-manager"
import { smartSyncNotes, saveAndSyncNote } from "@/lib/nostr-sync-fixed"
import { sanitizeNotes } from "@/lib/data-validators"
import { ErrorBoundary } from "@/components/error-boundary"
import { RelayManager } from "@/components/relay-manager"
import { ConnectionStatus } from "@/components/connection-status"
import { DiagnosticPage } from "@/components/diagnostic-page"
import { ThemeToggle } from "@/components/theme-toggle"
import { getDefaultRelays } from "@/lib/relay-manager"
import { DonationModal } from "@/components/donation-modal"

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
  eventId?: string // Nostr event ID for verification
  eventKind?: number // Track which kind was used (30078 or 31078)
}

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "remote"
  nsec?: string
  privateKey?: string // Hex string of private key (for nsec method)
  signer?: any
  clientSecretKey?: Uint8Array // For remote signer
  bunkerPubkey?: string // For remote signer
  bunkerUri?: string // For remote signer
  relays?: string[] // For remote signer
}

interface MainAppProps {
  authData: AuthData
  onLogout: () => void
}

export function MainApp({ authData, onLogout }: MainAppProps) {
  const { theme, setTheme } = useTheme()
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
    const failedNotes = notes.filter((n) => n.syncStatus === "error")

    if (failedNotes.length === 0) {
      return
    }

    console.log("[v0] Retrying", failedNotes.length, "failed syncs")
    setSyncStatus("syncing")

    for (const note of failedNotes) {
      try {
        const result = await saveAndSyncNote(note, authData)
        setNotes(notes.map((n) => (n.id === note.id ? result.note : n)))

        if (result.success) {
          await saveEncryptedNotes(
            authData.pubkey,
            notes.map((n) => (n.id === note.id ? result.note : n)),
          )
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
              failed: syncResult.failedCount,
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
  }, [authData]) // Only depend on pubkey, not entire authData object

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
          // Save synced state to local storage
          await saveEncryptedNotes(authData.pubkey, validatedNotes)
        }
      } catch (error) {
        console.error("[v0] Background sync failed:", error)
        setSyncStatus("error")
      }
    }, 60000)

    return () => clearInterval(syncInterval)
  }, [syncStatus, needsSync, authData, notes, deletedNotes]) // Removed notes/deletedNotes from deps to prevent loops

  useEffect(() => {
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

    let timeoutId: NodeJS.Timeout | null = null

    if (!isLoading && needsSync && syncStatus !== "syncing") {
      timeoutId = setTimeout(saveNotes, 2000)
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [needsSync, isLoading, syncStatus, authData, notes, deletedNotes]) // Removed notes/deletedNotes to prevent loops

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
      console.log("[v0] 🔄 Starting sync for new note:", newNote.id)
      const result = await saveAndSyncNote(newNote, authData)
      console.log("[v0] 📊 Sync result:", { success: result.success, eventId: result.note.eventId })

      setNotes([result.note, ...notes])
      setSelectedNote(result.note)

      if (result.success) {
        console.log("[v0] ✅ Note synced successfully with event ID:", result.note.eventId)
        const syncedNotes = [result.note, ...notes]
        await saveEncryptedNotes(authData.pubkey, syncedNotes)
        setLastSyncTime(new Date())
      } else {
        console.error("[v0] ❌ Sync failed:", result.error)
        setConnectionError(result.error || "Failed to sync new note")
      }
    } catch (error) {
      console.error("[v0] Error syncing new note:", error)
      const errorNote = {
        ...newNote,
        syncStatus: "error" as const,
        syncError: error instanceof Error ? error.message : "Sync failed",
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
      console.log("[v0] 🔄 Starting sync for updated note:", updatedNote.id)
      const result = await saveAndSyncNote(optimisticNote, authData)
      console.log("[v0] 📊 Update sync result:", { success: result.success, eventId: result.note.eventId })

      // Update with final sync status
      setNotes(notes.map((note) => (note.id === updatedNote.id ? result.note : note)))
      setSelectedNote(result.note)

      if (result.success) {
        console.log("[v0] ✅ Note update synced successfully with event ID:", result.note.eventId)
        // Save successful sync to local storage
        const syncedNotes = notes.map((note) => (note.id === updatedNote.id ? result.note : note))
        await saveEncryptedNotes(authData.pubkey, syncedNotes)
        setLastSyncTime(new Date())
      } else {
        console.error("[v0] ❌ Update sync failed:", result.error)
        setConnectionError(result.error || "Failed to sync note")
      }
    } catch (error) {
      console.error("[v0] Error syncing note:", error)
      const errorNote = {
        ...optimisticNote,
        syncStatus: "error" as const,
        syncError: error instanceof Error ? error.message : "Sync failed",
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

    // Step 1: Add to deleted notes FIRST (before UI update)
    const deletedNote = {
      id: noteToDelete.id,
      deletedAt: new Date(),
    }
    const newDeletedNotes = [...deletedNotes, deletedNote]
    setDeletedNotes(newDeletedNotes)

    // Step 2: Optimistically update the UI IMMEDIATELY
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

    // Step 3: Save the updated state to localStorage IMMEDIATELY
    try {
      await saveEncryptedNotes(authData.pubkey, updatedNotes)
      console.log("[v0] Saved updated notes to localStorage")
    } catch (error) {
      console.error("[v0] Failed to save to localStorage:", error)
    }

    // Step 4: Publish deletion event to Nostr (async, don't wait)
    deleteNoteOnNostrAsync(noteToDelete, authData)

    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
  }

  // Helper function to delete on Nostr asynchronously
  const deleteNoteOnNostrAsync = async (noteToDelete: Note, authData: any) => {
    try {
      console.log("[v0] Publishing NIP-09 deletion event to Nostr network...")
      const { deleteNoteOnNostr } = await import("@/lib/nostr-storage")
      await deleteNoteOnNostr(noteToDelete, authData)
      console.log("[v0] Successfully published deletion event to Nostr.")
    } catch (error) {
      console.error("[v0] Failed to publish deletion event:", error)
    }
    }

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
  }

  // Test publish function for debugging
  const testPublish = async () => {
    console.log("[Test] 🧪 Testing publish to Nostr...")
    
    try {
      const testEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "test"], ["t", "nostr-journal"]],
        content: "Test message from Nostr Journal - " + new Date().toISOString(),
        pubkey: authData.pubkey,
      }

      // Sign the event
      let signedEvent
      if (authData.authMethod === "nsec" && authData.privateKey) {
        const privateKeyBytes = new Uint8Array(
          authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
        )
        const { finalizeEvent } = await import("nostr-tools/pure")
        signedEvent = finalizeEvent(testEvent, privateKeyBytes)
      } else if (authData.authMethod === "extension" && window.nostr) {
        signedEvent = await window.nostr.signEvent(testEvent)
      } else {
        throw new Error("Cannot sign test event with current auth method")
      }

      console.log("[Test] 📝 Test event created:", signedEvent.id)
      
      // Publish using our improved function
      const { publishToNostr } = await import("@/lib/nostr-publish")
      const eventId = await publishToNostr(testEvent, authData)
      
      console.log("[Test] ✅ Test event published successfully!")
      console.log("[Test] 🆔 Event ID:", eventId)
      console.log("[Test] 🔗 View on nostr.band:", `https://nostr.band/e/${eventId}`)
      
      // Open in new tab
      window.open(`https://nostr.band/e/${eventId}`, '_blank')
      
    } catch (error) {
      console.error("[Test] ❌ Test publish failed:", error)
      setConnectionError("Test publish failed: " + (error instanceof Error ? error.message : "Unknown error"))
    }
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

  const handleCopyNpub = async () => {
    try {
      await navigator.clipboard.writeText(npub)
      setCopiedNpub(true)
      setTimeout(() => setCopiedNpub(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }


  const handleAddRelay = () => {
    if (!newRelay.trim()) return
    if (!newRelay.startsWith("wss://") && !newRelay.startsWith("ws://")) {
      alert("Relay URL must start with wss:// or ws://")
      return
    }
    if (relays.includes(newRelay)) {
      alert("This relay is already in your list")
      return
    }
    const updatedRelays = [...relays, newRelay]
    setRelays(updatedRelays)

    const relayObjects = updatedRelays.map((url) => ({
      url,
      enabled: true,
      status: "unknown" as const,
    }))
    localStorage.setItem("nostr_user_relays", JSON.stringify(relayObjects))
    setNewRelay("")
  }

  const handleRemoveRelay = (relay: string) => {
    const updatedRelays = relays.filter((r) => r !== relay)
    setRelays(updatedRelays)

    const relayObjects = updatedRelays.map((url) => ({
      url,
      enabled: true,
      status: "unknown" as const,
    }))
    localStorage.setItem("nostr_user_relays", JSON.stringify(relayObjects))
  }

  useEffect(() => {
    const loadNpub = async () => {
      try {
        const { npubEncode } = await import("nostr-tools/nip19")
        const encodedNpub = npubEncode(authData.pubkey)
        setNpub(encodedNpub)
      } catch (err) {
        console.error("Failed to encode npub:", err)
      }
    }

    const loadProfile = async () => {
      try {
        const { SimplePool } = await import("nostr-tools/pool")
        const { getRelays } = await import("@/lib/relay-manager")
        
        const RELAYS = await getRelays()
        const pool = new SimplePool()
        
        const events = await pool.querySync(RELAYS, {
          kinds: [0],
          authors: [authData.pubkey],
          limit: 1
        })

        if (events.length > 0) {
          const metadata = JSON.parse(events[0].content)
          console.log("[Profile] Fetched metadata:", metadata)
          if (metadata.picture) {
            console.log("[Profile] Setting profile picture:", metadata.picture)
            setProfilePicture(metadata.picture)
          }
          if (metadata.name || metadata.display_name) {
            console.log("[Profile] Setting display name:", metadata.display_name || metadata.name)
            setDisplayName(metadata.display_name || metadata.name)
          }
        } else {
          console.log("[Profile] No profile events found")
        }

        pool.close(RELAYS)
      } catch (err) {
        console.error("Failed to fetch profile metadata:", err)
      }
    }

    const loadRelays = () => {
      const savedRelays = localStorage.getItem("nostr_user_relays")
      if (savedRelays) {
        try {
          const userRelays = JSON.parse(savedRelays)
          const relayUrls = userRelays.map((relay: any) => (typeof relay === "string" ? relay : relay.url))
          setRelays(relayUrls)
        } catch {
          setRelays(getDefaultRelays())
        }
      } else {
        setRelays(getDefaultRelays())
      }
    }

    loadNpub()
    loadProfile()
    loadRelays()
  }, [authData.pubkey])

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
        {/* Clean Header */}
        <header className="sticky top-0 z-50 bg-white/95 dark:bg-card/95 backdrop-blur-sm border-b border-border">
          <div className="w-full px-4 py-3">
            <div className="flex items-center justify-between w-full">
              {/* Left side */}
              <div className="flex items-center gap-4">
                {/* Mobile menu */}
          <Button
            variant="ghost"
            size="sm"
                  className="md:hidden"
                  onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>

                {/* Logo */}
                <div className="flex items-center gap-3">
                  <Logo className="h-8 w-auto" />
                  {/* Color test - should be logo blue */}
                  <div className="w-4 h-4 bg-primary rounded ml-2" title="Logo blue test"></div>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{notes.length} notes</span>
                    <span>•</span>
                    <span className="capitalize">{authData.authMethod}</span>
                  </div>
                </div>
              </div>
              
              {/* Right side */}
              <div className="flex items-center gap-1">
                {/* Sync status */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs">
            {getSyncStatusIcon()}
                  <span className="text-muted-foreground">{getSyncStatusText()}</span>
                </div>
                
                {/* Support button */}
              <Button
                variant="ghost"
                size="sm"
                  onClick={() => setShowDonationModal(true)}
                  className="hidden sm:flex items-center gap-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              >
                  <Zap className="w-4 h-4" />
                  <span>Support</span>
              </Button>
                
                {/* Theme toggle with system option */}
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button variant="ghost" size="sm">
                      {theme === 'dark' ? (
                        <Moon className="w-4 h-4" />
                      ) : theme === 'light' ? (
                        <Sun className="w-4 h-4" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-current" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setTheme('light')}>
                      <Sun className="w-4 h-4 mr-2" />
                      Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('dark')}>
                      <Moon className="w-4 h-4 mr-2" />
                      Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('system')}>
                      <div className="w-4 h-4 mr-2 rounded-full border-2 border-current" />
                      System
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Account dropdown - working version */}
                <DropdownMenu>
                  <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="sm"
              >
                      <User className="w-4 h-4" />
                      <span className="hidden sm:inline ml-2">Account</span>
              </Button>
                  </DropdownMenuTrigger>
                  
                  <DropdownMenuContent 
                    align="end" 
                    className="w-96 z-[9999]"
                    sideOffset={8}
                  >
                    {/* Profile Section with Picture and NPub */}
                    <div className="px-4 py-4 border-b border-border">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center overflow-hidden">
                          {profilePicture ? (
                            <img 
                              src={profilePicture} 
                              alt="Profile" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextElementSibling.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div className={`w-full h-full flex items-center justify-center ${profilePicture ? 'hidden' : 'flex'}`}>
                            <User className="w-8 h-8 text-primary" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight">
                            {displayName || "Nostr Profile"}
                          </p>
                          <p className="text-xs text-muted-foreground leading-tight">Connected</p>
          </div>
        </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Public Key (npub)</label>
        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-3 py-2 rounded font-mono flex-1 truncate">
                            {npub || 'Loading...'}
                          </code>
          <Button
            variant="ghost"
            size="sm"
                            onClick={() => {
                              if (npub) {
                                navigator.clipboard.writeText(npub)
                                setCopiedNpub(true)
                                setTimeout(() => setCopiedNpub(false), 2000)
                              }
                            }}
                            className="h-8 w-8 p-0"
                          >
                            {copiedNpub ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenuGroup>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShowRelaysInDropdown(!showRelaysInDropdown)
                        }}
                        className="cursor-pointer"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Manage Relays
                        {showRelaysInDropdown ? (
                          <span className="ml-auto text-xs">▼</span>
                        ) : (
                          <span className="ml-auto text-xs">▶</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    
                    {/* Relays Submenu */}
                    {showRelaysInDropdown && (
                      <div className="px-4 py-3 border-t border-border bg-muted/30">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground mb-2 block">Add New Relay</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newRelay}
                                onChange={(e) => setNewRelay(e.target.value)}
                                placeholder="wss://relay.example.com"
                                className="flex-1 text-xs px-3 py-2 border rounded bg-background"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newRelay && !relays.includes(newRelay)) {
                                    const updatedRelays = [...relays, newRelay]
                                    setRelays(updatedRelays)
                                    localStorage.setItem('nostr-relays', JSON.stringify(updatedRelays))
                                    setNewRelay('')
                                  }
                                }}
                              />
          <Button
            size="sm"
                                onClick={() => {
                                  if (newRelay && !relays.includes(newRelay)) {
                                    const updatedRelays = [...relays, newRelay]
                                    setRelays(updatedRelays)
                                    localStorage.setItem('nostr-relays', JSON.stringify(updatedRelays))
                                    setNewRelay('')
                                  }
                                }}
                                className="h-8 px-3 text-xs"
                                disabled={!newRelay || relays.includes(newRelay)}
                              >
                                <Plus className="h-3 w-3" />
          </Button>
                            </div>
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground mb-2 block">Active Relays ({relays.length})</label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {relays.length > 0 ? (
                                relays.map((relay, index) => (
                                  <div key={index} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1">
                                    <span className="font-mono truncate flex-1">{relay}</span>
          <Button
            variant="ghost"
            size="sm"
                                      onClick={() => {
                                        const updatedRelays = relays.filter((_, i) => i !== index)
                                        setRelays(updatedRelays)
                                        localStorage.setItem('nostr-relays', JSON.stringify(updatedRelays))
                                      }}
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
          </Button>
        </div>
                                ))
                              ) : (
                                <div className="text-xs text-muted-foreground text-center py-2">No relays configured</div>
                              )}
      </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem 
                      onClick={() => {
                        console.log('[Dropdown] Logout clicked')
                        handleLogout()
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
        </div>
      </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <TagsPanel
            tags={tags}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            pubkey={authData.pubkey}
            onLogout={handleLogout}
            onDonationClick={() => setShowDonationModal(true)}
          />
        </div>

          {/* Mobile Sidebar */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileSidebarOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-64 bg-card border-r border-border shadow-xl">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="text-foreground font-medium">Menu</h2>
                <Button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  variant="ghost"
                  size="sm"
                    className="text-muted-foreground hover:text-foreground"
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
                onLogout={handleLogout}
                onDonationClick={() => {
                  setShowDonationModal(true)
                  setIsMobileSidebarOpen(false)
                }}
              />
            </div>
          </div>
        )}

          {/* Main content: Note List + Editor */}
          <div className="flex flex-1 min-w-0">
          <div className="w-full md:w-80 border-r border-border">
            <NoteList
              notes={filteredNotes}
              selectedNote={selectedNote}
              onSelectNote={setSelectedNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
                authData={authData}
            />
          </div>

            <div className="hidden lg:block flex-1">
            <Editor
              note={selectedNote}
              onUpdateNote={handleUpdateNote}
              onPublishNote={handlePublishNote}
              onPublishHighlight={handlePublishHighlight}
              onDeleteNote={handleDeleteNote}
                authData={authData}
            />
          </div>
        </div>

          {/* Mobile Editor Overlay */}
        {selectedNote && (
            <div className="fixed inset-0 z-40 lg:hidden bg-background">
              <div className="h-full flex flex-col">
                <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shadow-sm">
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
                <div className="flex-1 overflow-hidden">
              <Editor
                note={selectedNote}
                onUpdateNote={handleUpdateNote}
                onPublishNote={handlePublishNote}
                onPublishHighlight={handlePublishHighlight}
                onDeleteNote={handleDeleteNote}
                    authData={authData}
              />
                </div>
            </div>
          </div>
        )}
        </div>

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
              <Button onClick={() => setShowDiagnostics(false)} variant="ghost" size="sm">
                <X className="w-4 h-4" />
              </Button>
      </div>
            <DiagnosticPage />
          </div>
        )}

    </div>
    
    {/* Donation Modal */}
    <DonationModal
      open={showDonationModal}
      onOpenChange={setShowDonationModal}
    />
    </ErrorBoundary>
  )
}