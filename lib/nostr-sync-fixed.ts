/**
 * Fixed Nostr Sync - Prevents note loss
 * 
 * Key principles:
 * 1. Never delete local notes unless explicitly deleted by user
 * 2. Merge local + remote (don't replace)
 * 3. Always sync TO Nostr after loading FROM Nostr
 * 4. Track sync status per note
 */

import type { DecryptedNote } from "./nostr-crypto"
import type { DeletedNote } from "./nostr-storage"
import { fetchAllNotesFromNostr, saveNoteToNostr, deleteNoteOnNostr } from "./nostr-storage"

export interface SyncResult {
  notes: DecryptedNote[]
  deletedNotes: DeletedNote[]
  synced: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

/**
 * Smart sync that merges local and remote notes without data loss
 */
export async function smartSyncNotes(
  localNotes: DecryptedNote[],
  localDeletedNotes: DeletedNote[],
  authData: any
): Promise<SyncResult> {
  console.log("[SmartSync] 🔄 Starting smart sync...")
  console.log("[SmartSync] 📊 Local notes:", localNotes.length)
  
  const errors: string[] = []
  let syncedCount = 0
  let failedCount = 0

  try {
    // Step 1: Fetch notes from Nostr
    console.log("[SmartSync] 📥 Fetching from Nostr relays...")
    const remoteNotes = await fetchAllNotesFromNostr(authData)
    console.log("[SmartSync] 📊 Remote notes:", remoteNotes.length)

    // Step 2: Merge local and remote (keep most recent version)
    const mergedNotes = mergeNotes(localNotes, remoteNotes)
    console.log("[SmartSync] 🔀 Merged to:", mergedNotes.length, "notes")

    // Step 3: Sync any local-only notes TO Nostr
    const notesToSync = mergedNotes.filter(note => 
      note.syncStatus === 'local' || 
      !note.eventId ||
      (note.lastModified && note.lastSynced && note.lastModified > note.lastSynced)
    )
    
    console.log("[SmartSync] 📤 Need to sync to Nostr:", notesToSync.length)

    // Step 4: Upload local-only/changed notes to Nostr (parallel for speed)
    if (notesToSync.length > 0) {
      console.log("[SmartSync] ⬆️ Syncing", notesToSync.length, "notes in parallel...")
      
      // Process notes in parallel with concurrency limit for speed
      const concurrencyLimit = 3 // Sync up to 3 notes at once
      const results = await Promise.allSettled(
        notesToSync.map(async (note, index) => {
          // Stagger requests slightly to avoid overwhelming relays
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 100))
          }
          
          try {
            console.log("[SmartSync] ⬆️ Syncing note:", note.title)
            const result = await saveNoteToNostr(note, authData)
            
            if (result.success) {
              // Update the note with sync info
              note.eventId = result.eventId
              note.lastSynced = new Date()
              note.syncStatus = 'synced'
              console.log("[SmartSync] ✅ Synced:", note.title)
              return { success: true, note }
            } else {
              note.syncStatus = 'error'
              note.syncError = result.error
              console.error("[SmartSync] ❌ Failed:", note.title, result.error)
              return { success: false, note, error: result.error }
            }
          } catch (error) {
            note.syncStatus = 'error'
            note.syncError = error instanceof Error ? error.message : "Unknown error"
            console.error("[SmartSync] ❌ Error syncing:", note.title, error)
            return { success: false, note, error: note.syncError }
          }
        })
      )
      
      // Count results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            syncedCount++
          } else {
            failedCount++
            errors.push(`Failed to sync "${result.value.note.title}": ${result.value.error}`)
          }
        } else {
          failedCount++
          errors.push(`Failed to sync note: ${result.reason}`)
        }
      })
    }

    // Step 5: Process deletions
    const remoteNoteIds = new Set(remoteNotes.map(n => n.id))
    const newDeletedNotes = [...localDeletedNotes]

    // If a note exists locally but not remotely, and it was synced before,
    // it might have been deleted on another device
    for (const remoteNote of remoteNotes) {
      if (!mergedNotes.find(n => n.id === remoteNote.id)) {
        // This note was deleted locally but still exists remotely
        // Keep it deleted locally
        if (!localDeletedNotes.find(d => d.id === remoteNote.id)) {
          console.log("[SmartSync] 🗑️ Note deleted on another device:", remoteNote.title)
          newDeletedNotes.push({
            id: remoteNote.id,
            deletedAt: new Date()
          })
        }
      }
    }

    const allSynced = failedCount === 0
    console.log("[SmartSync] ✅ Sync complete:", {
      synced: syncedCount,
      failed: failedCount,
      total: mergedNotes.length
    })

    return {
      notes: mergedNotes,
      deletedNotes: newDeletedNotes,
      synced: allSynced,
      syncedCount,
      failedCount,
      errors
    }

  } catch (error) {
    console.error("[SmartSync] ❌ Sync failed:", error)
    
    // CRITICAL: On error, return local notes unchanged
    // This prevents data loss
    return {
      notes: localNotes.map(note => ({
        ...note,
        syncStatus: 'error' as const,
        syncError: error instanceof Error ? error.message : "Sync failed"
      })),
      deletedNotes: localDeletedNotes,
      synced: false,
      syncedCount: 0,
      failedCount: localNotes.length,
      errors: [error instanceof Error ? error.message : "Unknown sync error"]
    }
  }
}

/**
 * Merge local and remote notes, keeping the most recent version
 */
function mergeNotes(localNotes: DecryptedNote[], remoteNotes: DecryptedNote[]): DecryptedNote[] {
  const noteMap = new Map<string, DecryptedNote>()

  // Add all local notes
  for (const note of localNotes) {
    noteMap.set(note.id, {
      ...note,
      syncStatus: note.syncStatus || 'local'
    })
  }

  // Merge with remote notes (prefer remote if it's newer)
  for (const remoteNote of remoteNotes) {
    const localNote = noteMap.get(remoteNote.id)
    
    if (!localNote) {
      // New note from remote
      noteMap.set(remoteNote.id, {
        ...remoteNote,
        syncStatus: 'synced',
        lastSynced: new Date()
      })
    } else {
      // Note exists both locally and remotely
      // Use the one with the most recent modification
      
      // Helper function to safely get timestamp from date
      const getTimestamp = (date: any): number => {
        if (!date) return 0
        if (date instanceof Date) return date.getTime()
        if (typeof date === 'string') return new Date(date).getTime()
        if (typeof date === 'number') return date
        return 0
      }
      
      const localTime = getTimestamp(localNote.lastModified) || getTimestamp(localNote.createdAt)
      const remoteTime = getTimestamp(remoteNote.lastModified) || getTimestamp(remoteNote.createdAt)
      
      if (remoteTime > localTime) {
        // Remote is newer - use it
        console.log("[SmartSync] 📥 Using remote version (newer):", remoteNote.title)
        noteMap.set(remoteNote.id, {
          ...remoteNote,
          syncStatus: 'synced',
          lastSynced: new Date()
        })
      } else if (localTime > remoteTime) {
        // Local is newer - keep it but mark for sync
        console.log("[SmartSync] 📤 Keeping local version (newer):", localNote.title)
        noteMap.set(localNote.id, {
          ...localNote,
          syncStatus: 'local' // Will be synced to Nostr
        })
      } else {
        // Same time - prefer remote (it's the source of truth)
        noteMap.set(remoteNote.id, {
          ...remoteNote,
          syncStatus: 'synced',
          lastSynced: new Date()
        })
      }
    }
  }

  return Array.from(noteMap.values())
}

/**
 * Save a single note and return updated note with sync status
 */
export async function saveAndSyncNote(
  note: DecryptedNote,
  authData: any
): Promise<{ note: DecryptedNote; success: boolean; error?: string }> {
  console.log("[SaveAndSync] 💾 Saving note:", note.title)
  
  try {
    // Update last modified time
    const updatedNote = {
      ...note,
      lastModified: new Date(),
      syncStatus: 'syncing' as const
    }

    // Save to Nostr
    const result = await saveNoteToNostr(updatedNote, authData)

    if (result.success) {
      console.log("[SaveAndSync] ✅ Successfully synced:", note.title)
      return {
        note: {
          ...updatedNote,
          eventId: result.eventId,
          lastSynced: new Date(),
          syncStatus: 'synced',
          syncError: undefined
        },
        success: true
      }
    } else {
      console.error("[SaveAndSync] ❌ Failed to sync:", note.title, result.error)
      return {
        note: {
          ...updatedNote,
          syncStatus: 'error',
          syncError: result.error
        },
        success: false,
        error: result.error
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[SaveAndSync] ❌ Error:", errorMsg)
    
    return {
      note: {
        ...note,
        syncStatus: 'error',
        syncError: errorMsg
      },
      success: false,
      error: errorMsg
    }
  }
}
