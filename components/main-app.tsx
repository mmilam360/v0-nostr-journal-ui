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
  Zap,
  Upload,
  Download,
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
import { loadEncryptedNotes } from "@/lib/nostr-crypto"
import { createNostrEvent, publishToNostr } from "@/lib/nostr-publish"
import { cleanupSigner } from "@/lib/signer-manager"
// import { smartSyncNotes, saveAndSyncNote } from "@/lib/nostr-sync-fixed" // Disabled - using simple events
import { loadJournalFromKind30001, saveJournalAsKind30001, deleteJournalKind30001, syncFromKind30001 } from "@/lib/kind30001-journal"
import { sanitizeNotes } from "@/lib/data-validators"
import { ErrorBoundary } from "@/components/error-boundary"
import { RelayManager } from "@/components/relay-manager"
import { ConnectionStatus } from "@/components/connection-status"
import { DiagnosticPage } from "@/components/diagnostic-page"
import { ThemeToggle } from "@/components/theme-toggle"
import { getDefaultRelays, initializePersistentRelayPool, shutdownPersistentRelayPool } from "@/lib/relay-manager"
import { DonationModal } from "@/components/donation-modal-proper"
import { setActiveSigner } from "@/lib/signer-connector"
import { remoteSignerManager } from "@/lib/remote-signer-manager"
import { createDirectEventManager, type DirectEventManager } from "@/lib/direct-event-manager"
import { LoadingScreen } from "@/components/loading-screen"
import { addSyncTask, addHighPrioritySyncTask, onSyncTaskCompleted, onSyncTaskFailed, getSyncQueueStats } from "@/lib/sync-queue"
import type { Nip46SessionState } from 'nostr-signer-connector'

// Sync Status Component
const SyncStatusIcons = ({ note }: { note: Note }) => {
  return (
    <div className="flex items-center gap-1">
      {/* Upload status - published to relays */}
      {note.publishedToRelays ? (
        <Upload className="w-3 h-3 text-green-500" title="Published to relays" />
      ) : (
        <Upload className="w-3 h-3 text-gray-400" title="Not published to relays" />
      )}
      
      {/* Download status - fetched from relays */}
      {note.fetchedFromRelays ? (
        <Download className="w-3 h-3 text-blue-500" title="Fetched from relays" />
      ) : (
        <Download className="w-3 h-3 text-gray-400" title="Not fetched from relays" />
      )}
    </div>
  )
}

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
  isSynced?: boolean // True if event exists on relays and is verified
  // Sync status tracking
  publishedToRelays?: boolean // True if successfully published to relays
  fetchedFromRelays?: boolean // True if successfully fetched from relays
}

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "remote"
  nsec?: string
  privateKey?: string // Hex string of private key (for nsec method)
  signer?: any
  clientSecretKey?: Uint8Array | string // For remote signer (can be Uint8Array or hex string)
  bunkerPubkey?: string // For remote signer
  bunkerUri?: string // For remote signer
  relays?: string[] // For remote signer
  sessionData?: Nip46SessionState // CHANGED: Use proper type
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
  const [syncQueueStats, setSyncQueueStats] = useState({ queueLength: 0, processing: false })
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Direct event manager
  const [eventManager] = useState<DirectEventManager>(() => createDirectEventManager())

  // Simplified sync operations using global sync manager

  const retryConnection = async () => {
    console.log("[v0] 🔄 Retrying connection - querying relays...")
    setConnectionError(null)
    setSyncStatus("syncing")

    try {
      // Retry is just loading from relays (same as sync)
      const relayNotes = await syncFromRelays(authData)
      
      // Validate and sanitize the notes
      const validatedNotes = sanitizeNotes(relayNotes)
      
      // Update state with latest notes from relays
      setNotes(validatedNotes)
      setSyncStatus("synced")
        setLastSyncTime(new Date())
      
      // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
      
      // Update tags
      const allTags = new Set<string>()
      validatedNotes.forEach((note) => {
        note.tags.forEach((tag) => allTags.add(tag))
      })
      setTags(Array.from(allTags))
      
      console.log(`[v0] ✅ Retry complete: ${validatedNotes.length} notes loaded from relays`)
      
    } catch (error) {
      console.error("[v0] Retry failed:", error)
      setSyncStatus("error")
      setConnectionError(error instanceof Error ? error.message : "Retry failed")
    }
  }

  const ensureRemoteSignerAvailable = async () => {
    console.log("[v0] 🔧 Checking if remote signer is available...")
    
    try {
      // Check if remote signer manager is available
      if (remoteSignerManager.isAvailable()) {
        console.log("[v0] ✅ Remote signer manager is available")
        const sessionInfo = remoteSignerManager.getSessionInfo()
        console.log("[v0] 🔍 Remote signer session info:", sessionInfo)
        return true
      }
      
      console.log("[v0] ⚠️ Remote signer manager not available, attempting to resume...")
      
      // Debug: Check what's in localStorage
      console.log("[v0] 🔍 Debugging localStorage contents:")
      console.log("[v0] 🔍 - nostr_remote_session:", localStorage.getItem('nostr_remote_session'))
      console.log("[v0] 🔍 - All localStorage keys:", Object.keys(localStorage))
      
      // Try to resume session from localStorage
      const savedSession = localStorage.getItem('nostr_remote_session')
      if (savedSession) {
        console.log("[v0] 🔧 Found saved session, attempting to resume...")
        console.log("[v0] 🔧 Session data:", savedSession)
        const sessionData = JSON.parse(savedSession)
        
        // Try to initialize remote signer manager from saved session
        const success = await remoteSignerManager.initializeFromSessionData(sessionData, authData.pubkey)
        
        if (success) {
          console.log("[v0] ✅ Remote signer session resumed successfully")
          return true
        } else {
          console.error("[v0] ❌ Failed to resume remote signer session")
          return false
        }
      } else {
        console.error("[v0] ❌ No saved session found for remote signer")
        console.log("[v0] 🔍 This suggests the session was never saved during login")
        return false
      }
    } catch (error) {
      console.error("[v0] ❌ Error ensuring remote signer availability:", error)
      return false
    }
  }

  const retrySyncFailedNotes = async () => {
    const failedNotes = notes.filter((n) => !n.eventId)

    if (failedNotes.length === 0) {
      return
    }

    console.log("[v0] Retrying", failedNotes.length, "failed syncs")
    setSyncStatus("syncing")

    for (const note of failedNotes) {
      try {
        const result = await saveAndSyncNote(note, authData)
        setNotes(prevNotes => prevNotes.map((n) => (n.id === note.id ? result.note : n)))

        if (result.success) {
          // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
        }
      } catch (error) {
        console.error("[v0] Retry failed for:", note.title, error)
      }
    }

    setSyncStatus("synced")
    setLastSyncTime(new Date())
  }

  useEffect(() => {
    // Set up sync queue event handlers with error protection
    try {
      onSyncTaskCompleted((result) => {
        console.log('[SyncQueue] Task completed:', result.taskId, result.success ? 'SUCCESS' : 'FAILED');
        console.log('[SyncQueue] EventId:', result.eventId);
        
        if (result.success && result.eventId) {
          console.log('[SyncQueue] Updating note with eventId:', result.eventId);
          // Update note with eventId
          setNotes(prevNotes => 
            prevNotes.map(note => 
              note.id === result.taskId 
                ? { ...note, eventId: result.eventId }
                : note
            )
          );
        } else {
          console.log('[SyncQueue] Not updating note - success:', result.success, 'eventId:', result.eventId);
        }
      });

      onSyncTaskFailed((task, error) => {
        console.error('[SyncQueue] Task failed:', task.id, error);
        // Could show user notification here
      });
    } catch (error) {
      console.warn('[SyncQueue] Error setting up event handlers:', error);
    }

    // PERMANENTLY DISABLED - Sync queue stats cause loading issues
    // Even with delayed startup, they interfere with initialization
    // return () => {
    //   // No cleanup needed since we're not starting any intervals
    // };

    const loadUserNotes = async () => {
      console.log("[v0] Loading notes for user:", authData.pubkey)
      
      setIsLoading(true)
      setSyncStatus("syncing")

      try {
        // ALWAYS check and set up remote signer if needed
        console.log("[v0] 🔧 Checking remote signer setup for auth method:", authData.authMethod)
        
        // Set up the remote signer for remote authentication
        if (authData.authMethod === 'remote') {
          console.log("[v0] 🔧 Setting up remote signer from session data")
          console.log("[v0] 🔧 AuthData:", {
            pubkey: authData.pubkey,
            authMethod: authData.authMethod,
            hasSessionData: !!authData.sessionData,
            hasClientSecretKey: !!authData.clientSecretKey,
            hasBunkerUri: !!authData.bunkerUri
          })
          
          // Use the new remote signer manager
          if (authData.sessionData) {
            console.log("[v0] 🔧 Initializing remote signer manager from session data...")
            const success = await remoteSignerManager.initializeFromSessionData(authData.sessionData, authData.pubkey)
            
            if (success) {
              console.log("[v0] ✅ Remote signer manager initialized successfully")
              
              // Also set up the legacy signer connector for backward compatibility
              try {
                const { resumeNip46Session } = await import('@/lib/signer-connector')
                const signer = await resumeNip46Session(authData.sessionData)
                if (signer) {
                  console.log("[v0] ✅ Legacy signer connector also set up for compatibility")
                }
              } catch (error) {
                console.warn("[v0] ⚠️ Could not set up legacy signer connector:", error)
              }
            } else {
              console.error("[v0] ❌ Failed to initialize remote signer manager")
            }
          } else {
            console.error("[v0] ❌ No session data available for remote signer setup")
          }
        }

        // Load notes from Kind 30001 lists
        console.log("[v0] Loading journal entries from Kind 30001 lists...")
        let relayNotes: any[] = []
        try {
          relayNotes = await loadJournalFromKind30001(authData)
          console.log("[v0] ✅ Loaded", relayNotes.length, "journal entries from Kind 30001 lists")
        } catch (error) {
          console.error("[v0] ❌ Failed to load from Kind 30001 lists:", error)
        }

        // LOCAL STORAGE DISABLED - Only use remote data
        console.log("[v0] 🌐 Using only remote data - local storage disabled")
        
        // Use only relay notes since local storage is disabled
        const allNotes = relayNotes.map(note => ({
          ...note,
          source: 'relay',
          fetchedFromRelays: true,
          publishedToRelays: true, // If fetched from relays, it was previously published
          isSynced: true // All notes fetched from relays are synced
        }))
        
        console.log("[v0] Loaded", allNotes.length, "notes from Nostr relays only")
        
        // Validate and sanitize all notes
        const validatedNotes = sanitizeNotes(allNotes)
        console.log("[v0] Validated notes:", validatedNotes.length)

        // Set notes in state
        setNotes(validatedNotes)

        // Extract tags
        const allTags = new Set<string>()
        validatedNotes.forEach((note) => {
          note.tags.forEach((tag) => allTags.add(tag))
        })
        setTags(Array.from(allTags))

        setIsLoading(false)
        setSyncStatus("synced")
          setLastSyncTime(new Date())

        console.log("[v0] ✅ Notes loaded successfully:", validatedNotes.length)

      } catch (error) {
        console.error("[v0] Error loading notes:", error)
        setSyncStatus("error")
        setConnectionError(error instanceof Error ? error.message : "Failed to load notes")
        setIsLoading(false)
        // CRITICAL: Set empty array instead of leaving undefined
        setNotes([])
      }
    }

    // Add timeout to prevent infinite loading
    const loadTimeout = setTimeout(() => {
      console.warn("[v0] Load timeout reached, forcing completion")
      setIsLoading(false)
      setSyncStatus("error")
      setConnectionError("Loading timeout - please refresh")
    }, 30000) // 30 second timeout

    if (authData.pubkey) {
      loadUserNotes().finally(() => {
        clearTimeout(loadTimeout)
      })
    } else {
      clearTimeout(loadTimeout)
    }
    
    // Cleanup relay pool on unmount
    return () => {
      shutdownPersistentRelayPool()
    }
  }, [authData]) // Only depend on pubkey, not entire authData object

  // Background sync disabled - using instant sync instead
  // useEffect(() => {
  //   const syncInterval = setInterval(async () => {
  //     if (syncStatus === "syncing" || needsSync) return

  //     console.log("[v0] Performing background sync...")
  //     setSyncStatus("syncing")

  //     try {
  //       // Use simple sync - just reload from relays
  //       const relayNotes = await loadNotesFromRelays(authData)
  //       const localNotes = await loadEncryptedNotes(authData.pubkey)

  //       // Merge relay and local notes, preferring relay notes when available
  //       const noteMap = new Map()
  //       localNotes.forEach(note => noteMap.set(note.id, { ...note, source: 'local' }))
  //       relayNotes.forEach(note => noteMap.set(note.id, { ...note, source: 'relay' }))
  //       const mergedNotes = Array.from(noteMap.values())

  //       const validatedNotes = sanitizeNotes(mergedNotes)

  //       if (validatedNotes.length !== notes.length || JSON.stringify(validatedNotes) !== JSON.stringify(notes)) {
  //         console.log("[v0] Background sync found changes")
  //         setNotes(validatedNotes)
  //         await saveEncryptedNotes(authData.pubkey, validatedNotes)
  //       }

  //       setSyncStatus("synced")
  //       setLastSyncTime(new Date())
  //     } catch (error) {
  //       console.error("[v0] Background sync failed:", error)
  //       setSyncStatus("error")
  //     }
  //   }, 300000) // 5 minutes - much less frequent

  //   return () => clearInterval(syncInterval)
  // }, [syncStatus, needsSync, authData, notes, deletedNotes])

  // Old sync system disabled - using instant sync instead
  // useEffect(() => {
  //     const saveNotes = async () => {
  //       console.log("[v0] Triggering sync after changes...")

  //     // Save locally first (instant feedback)
  //       await saveEncryptedNotes(authData.pubkey, notes)

  //       if (notes.length > 0 || deletedNotes.length > 0) {
  //         try {
  //           setSyncStatus("syncing")

  //           setNotes((prev) =>
  //             prev.map((note) => ({
  //               ...note,
  //               syncStatus: "syncing" as const,
  //             })),
  //           )

  //           console.log("[v0] Syncing changes to Nostr...")
  //         const result = await smartSyncNotes(notes, deletedNotes, authData)

  //         // Validate results
  //         const validatedNotes = sanitizeNotes(result.notes)

  //         if (validatedNotes.length > 0 && JSON.stringify(validatedNotes) !== JSON.stringify(notes)) {
  //             console.log("[v0] Sync returned changes, updating state")

  //           const syncedNotes = validatedNotes.map((note) => ({
  //               ...note,
  //               syncStatus: result.synced ? ("synced" as const) : ("error" as const),
  //             }))

  //             setNotes(syncedNotes)
  //             setDeletedNotes(result.deletedNotes)
  //           }

  //           setSyncStatus(result.synced ? "synced" : "error")
  //           if (result.synced) {
  //             setLastSyncTime(new Date())
  //           }
  //         } catch (error) {
  //           console.error("[v0] Error syncing to Nostr:", error)
  //           setSyncStatus("error")

  //           setNotes((prev) =>
  //             prev.map((note) => ({
  //               ...note,
  //               syncStatus: "error" as const,
  //             })),
  //           )
  //         }
  //       }

  //       setNeedsSync(false)
  //     }

  //   let timeoutId: NodeJS.Timeout | null = null

  //   if (!isLoading && needsSync && syncStatus !== "syncing") {
  //     timeoutId = setTimeout(saveNotes, 2000)
  //   }

  //   return () => {
  //     if (timeoutId) {
  //       clearTimeout(timeoutId)
  //     }
  //   }
  // }, [needsSync, isLoading, syncStatus, authData, notes, deletedNotes]) // Removed notes/deletedNotes to prevent loops

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
    }

    // Add to UI immediately
    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    setSelectedNote(newNote)

    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays

    // Save to relays as Kind 30001 list
    try {
      console.log("[v0] 📡 Attempting to save note as Kind 30001 list...")
      console.log("[v0] Auth method:", authData.authMethod)
      
      // CRITICAL: Check if remote signer is active
      if (authData.authMethod === 'remote') {
        const { getActiveSigner } = await import('@/lib/signer-connector')
        const signer = getActiveSigner()
        if (!signer) {
          console.error("[v0] ❌ Remote signer not active!")
          throw new Error("Remote signer disconnected. Please reconnect.")
        }
        console.log("[v0] ✅ Remote signer is active")
      }
      
      const result = await saveJournalAsKind30001(newNote, authData)
      console.log("[v0] 📡 Save result:", result)
      
      if (result.success && result.eventId) {
        console.log("[v0] ✅ Note saved successfully with eventId:", result.eventId)
        
        // Update with eventId and sync status
        const finalNote = { 
          ...newNote, 
          eventId: result.eventId, 
          lastSynced: new Date(),
          isSynced: true,
          publishedToRelays: true,
          fetchedFromRelays: false
        }
        const finalUpdatedNotes = [finalNote, ...notes.filter(n => n.id !== newNote.id)]
        setNotes(finalUpdatedNotes)
        setSelectedNote(finalNote)
        
        console.log("[v0] ✅ Note creation complete!")
      } else {
        console.error("[v0] ❌ Failed to save note to relays:", result.error || "Unknown error")
        alert(`Failed to save note: ${result.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error("[v0] ❌ Error saving new note to relays:", error)
      alert(`Error saving note: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    console.log("[v0] New note created:", newNote.id)
  }

  const handleUpdateNote = async (updatedNote: Note) => {
    console.log("[v0] Updating note:", updatedNote.id)
    console.log("[v0] 🔍 Auth method check - authData.authMethod:", authData.authMethod)
    console.log("[v0] 🔍 Auth method type:", typeof authData.authMethod)

    // Update local state immediately
    const optimisticNote = {
      ...updatedNote,
      lastModified: new Date(),
    }

    setNotes(notes.map((note) => note.id === updatedNote.id ? optimisticNote : note))
    setSelectedNote(optimisticNote)

    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
    const updatedNotes = notes.map((note) => note.id === updatedNote.id ? optimisticNote : note)

    // Ensure remote signer is available before saving
    console.log("[v0] 🔍 DEBUG: Checking auth method for remote signer setup")
    console.log("[v0] 🔍 Auth method:", authData.authMethod)
    console.log("[v0] 🔍 Auth method type:", typeof authData.authMethod)
    console.log("[v0] 🔍 Auth method === 'remote':", authData.authMethod === 'remote')
    
    if (authData.authMethod === 'remote') {
      console.log("[v0] 🔧 Ensuring remote signer is available before saving...")
      await ensureRemoteSignerAvailable()
    } else {
      console.log("[v0] 🔍 Auth method is not 'remote', skipping remote signer check")
    }

    // Save to relays as Kind 30001 list
    try {
      console.log("[v0] 📡 Attempting to save updated note as Kind 30001 list...")
      console.log("[v0] Auth method:", authData.authMethod)
      
      // CRITICAL: Check if remote signer is active
      if (authData.authMethod === 'remote') {
        const { getActiveSigner } = await import('@/lib/signer-connector')
        const signer = getActiveSigner()
        if (!signer) {
          console.error("[v0] ❌ Remote signer not active!")
          throw new Error("Remote signer disconnected. Please reconnect.")
        }
        console.log("[v0] ✅ Remote signer is active")
      }
      
      const result = await saveJournalAsKind30001(optimisticNote, authData)
      console.log("[v0] 📡 Update result:", result)
      
      if (result.success && result.eventId) {
        console.log("[v0] ✅ Note updated successfully with eventId:", result.eventId)
        
        // Update with eventId and sync status
        const finalNote = { 
          ...optimisticNote, 
          eventId: result.eventId, 
          lastSynced: new Date(),
          isSynced: true,
          publishedToRelays: true,
          fetchedFromRelays: false
        }
        setNotes(prevNotes => prevNotes.map(n => n.id === updatedNote.id ? finalNote : n))
        setSelectedNote(finalNote)
        
        console.log("[v0] ✅ Note update complete!")
      } else {
        console.error("[v0] ❌ Failed to save updated note to relays:", result.error || "Unknown error")
        alert(`Failed to update note: ${result.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error("[v0] ❌ Error saving updated note to relays:", error)
      alert(`Error updating note: ${error instanceof Error ? error.message : "Unknown error"}`)
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

    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
    console.log("[v0] 🌐 Notes are stored on Nostr relays only")

    // Flush any pending batch operations
    try {
      await eventManager.processQueue(authData)
      console.log("[v0] Flushed pending batch operations")
    } catch (error) {
      console.error("[v0] Error flushing batch operations:", error)
    }

    // Clean up the remote signer connection
    await cleanupSigner()
    
    // IMPORTANT: Clear saved remote session
    if (authData.authMethod === 'remote') {
      localStorage.removeItem('nostr_remote_session')
      console.log("[v0] ✅ Remote session cleared")
    }

    console.log("[v0] Notes will remain encrypted in storage")
    onLogout()
  }

  const handleDeleteNote = async (noteToDelete: Note) => {
    console.log("[v0] Delete requested for note:", noteToDelete.id)

    // Clear cache since we're deleting data
    const { clearUserCache } = await import('@/lib/nostr-storage')
    clearUserCache(authData)

    // Show confirmation modal instead of deleting immediately
    setNoteToDelete(noteToDelete)
    setShowDeleteConfirmation(true)
  }

  const handleConfirmDelete = async () => {
    if (!noteToDelete) return

    console.log("[v0] Deleting note:", noteToDelete.id, noteToDelete.title)

    // Remove from local state immediately
    const updatedNotes = notes.filter((note) => note.id !== noteToDelete.id)
    setNotes(updatedNotes)

    if (selectedNote?.id === noteToDelete.id) {
      setSelectedNote(null)
    }

    // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays

    // Delete from relays using Kind 30001 model
    if (noteToDelete.eventId) {
      try {
        const result = await deleteJournalKind30001(noteToDelete, authData)
        if (result.success) {
          console.log("[v0] ✅ Journal entry deleted from relays")
        } else {
          console.error("[v0] ❌ Failed to delete from relays:", result.error)
        }
      } catch (error) {
        console.error("[v0] ❌ Error deleting from relays:", error)
      }
    } else {
      console.log("[v0] Note has no eventId, skipping relay deletion")
    }

    // Update tags
    const allTags = new Set<string>()
    updatedNotes.forEach((note) => {
      note.tags.forEach((tag) => allTags.add(tag))
    })
    setTags(Array.from(allTags))

    setShowDeleteConfirmation(false)
    setNoteToDelete(null)
    
    console.log("[v0] ✅ Note deleted")
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

  // Sort notes by lastModified date (most recent first)
  const sortedNotes = filteredNotes.sort((a, b) => 
    new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  )

  const getSyncStatusText = () => {
    // PERMANENTLY DISABLED - Sync queue stats cause loading issues
    // const queueText = syncQueueStats.queueLength > 0 ? ` (${syncQueueStats.queueLength} queued)` : '';
    
    switch (syncStatus) {
      case "synced":
        return lastSyncTime ? `Synced ${lastSyncTime.toLocaleTimeString()}` : `Synced`
      case "syncing":
        return `Syncing...`
      case "error":
        return `Sync failed`
      default:
        return "Local only"
    }
  }

  const getSyncStatusIcon = () => {
    // PERMANENTLY DISABLED - Sync queue stats cause loading issues
    // if (syncQueueStats.processing || syncQueueStats.queueLength > 0) {
    //   return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    // }
    
    switch (syncStatus) {
      case "synced":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "syncing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case "offline":
        return <CloudOff className="h-4 w-4 text-gray-500" />
      default:
        return <RefreshCw className="h-4 w-4 text-gray-500" />
    }
  }

  const handleManualSync = async () => {
    console.log("[v0] Manual sync requested - querying relays for latest events")
    setSyncStatus("syncing")

    try {
      // Sync is just loading from Kind 30001 lists (same as app startup)
      const relayNotes = await syncFromKind30001(authData)
      
      // Mark all relay notes as fetched from relays
      const notesWithSyncStatus = relayNotes.map(note => ({
        ...note,
        fetchedFromRelays: true,
        publishedToRelays: true, // If fetched from relays, it was previously published
        isSynced: true, // All notes fetched from relays are synced
        eventId: note.eventId || note.id // Ensure eventId is set (use note.id as fallback)
      }))
      
      // Validate and sanitize the notes
      const validatedNotes = sanitizeNotes(notesWithSyncStatus)
      
      // Update state with latest notes from relays
      setNotes(validatedNotes)
      
      // Update selected note if it exists in the refreshed notes
      if (selectedNote) {
        const updatedSelectedNote = validatedNotes.find(note => note.id === selectedNote.id)
        if (updatedSelectedNote) {
          setSelectedNote(updatedSelectedNote)
          console.log("[v0] Updated selected note with latest data from relays")
        }
      }
      
      setSyncStatus("synced")
      setLastSyncTime(new Date())
      
      // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
      
      // Update tags
      const allTags = new Set<string>()
      validatedNotes.forEach((note) => {
        note.tags.forEach((tag) => allTags.add(tag))
      })
      setTags(Array.from(allTags))
      
      console.log(`[v0] ✅ Manual sync complete: ${validatedNotes.length} notes loaded from relays`)
      
    } catch (error) {
      console.error("[v0] Manual sync failed:", error)
      setSyncStatus("error")
      setConnectionError(error instanceof Error ? error.message : "Manual sync failed")
    }
  }

  const handleManualRefresh = async () => {
    console.log("[v0] Manual refresh triggered")
    setIsRefreshing(true)
    
    try {
      // Use the same logic as page load - fetch from Kind 30001 lists
      const relayNotes = await loadJournalFromKind30001(authData)
      console.log("[v0] ✅ Refreshed", relayNotes.length, "journal entries from Kind 30001 lists")
      
      // Update notes with fetched data (set both sync statuses to true and ensure event IDs are present)
      const updatedNotes = relayNotes.map(note => ({
        ...note,
        publishedToRelays: true,
        fetchedFromRelays: true,
        isSynced: true, // All notes fetched from relays are synced
        eventId: note.eventId || note.id // Ensure eventId is set (use note.id as fallback)
      }))
      
      // Validate and sanitize the notes
      const validatedNotes = sanitizeNotes(updatedNotes)
      
      setNotes(validatedNotes)
      
      // Update selected note to point to the updated note object (triggers Editor re-render)
      if (selectedNote) {
        const updatedSelectedNote = validatedNotes.find(note => note.id === selectedNote.id)
        if (updatedSelectedNote) {
          setSelectedNote(updatedSelectedNote)
          console.log("[v0] Updated selected note with latest data from relays")
        }
      }
      
      // Removed auto-selection - users should stay on their current note view
      
      // LOCAL STORAGE DISABLED - Notes are only stored on Nostr relays
      
      // Update tags
      const allTags = new Set<string>()
      validatedNotes.forEach((note) => {
        note.tags.forEach((tag) => allTags.add(tag))
      })
      setTags(Array.from(allTags))
      
      console.log("[v0] ✅ Manual refresh complete")
      
    } catch (error) {
      console.error("[v0] ❌ Manual refresh failed:", error)
    } finally {
      setIsRefreshing(false)
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
    return <LoadingScreen isLoading={true} />
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
                {/* Sync status - Desktop */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Events sync instantly</span>
                </div>
                
                {/* Manual refresh button - Desktop */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="hidden md:flex items-center gap-2 text-xs"
                  title="Refresh notes from relays"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="hidden lg:inline">Refresh</span>
                </Button>
                
                {/* Sync status - Mobile (icon only) */}
                <div className="md:hidden">
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" title="Refreshing..." />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleManualRefresh}
                      className="p-1"
                      title="Refresh notes from relays"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                
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
                                const nextElement = e.currentTarget.nextElementSibling as HTMLElement
                                if (nextElement) {
                                  nextElement.style.display = 'flex'
                                }
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
                        console.log('[Dropdown] Support clicked')
                        setShowDonationModal(true)
                      }}
                      className="text-amber-600 focus:text-amber-600"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Support
                    </DropdownMenuItem>
                    
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
              <div className="flex flex-col h-full">
                {/* Tags Panel */}
                <div className="flex-shrink-0">
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
                
                {/* Note List */}
                <div className="flex-1 overflow-hidden">
                  <NoteList
                    notes={sortedNotes}
                    selectedNote={selectedNote}
                    onSelectNote={(note) => {
                      setSelectedNote(note)
                      setIsMobileSidebarOpen(false)
                    }}
                    onCreateNote={() => {
                      handleCreateNote()
                      setIsMobileSidebarOpen(false)
                    }}
                    onDeleteNote={handleDeleteNote}
                    authData={authData}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

          {/* Main content: Note List + Editor */}
          <div className="flex flex-1 min-w-0">
          <div className="w-full md:w-80 border-r border-border">
            <NoteList
              notes={sortedNotes}
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
    
    {/* Proper Lightning Donation Modal */}
    <DonationModal
      open={showDonationModal}
      onOpenChange={setShowDonationModal}
    />
    
    </ErrorBoundary>
  )
}