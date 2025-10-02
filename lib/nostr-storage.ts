// Cross-device note storage using Nostr events (NIP-78)
import { type Event, finalizeEvent, getPublicKey } from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social",
]

// NIP-78 Application Data Storage
const APP_DATA_KIND = 30078
const APP_IDENTIFIER = "nostr-journal-v1"

export interface NostrStorageResult {
  success: boolean
  error?: string
  eventId?: string
}

export interface DeletedNote {
  id: string
  deletedAt: Date
}

export interface NotesData {
  notes: DecryptedNote[]
  deletedNotes: DeletedNote[]
  version: number
}

// Simple encryption for demo - in production use proper NIP-44
async function encryptForSelf(data: string, privateKey: Uint8Array): Promise<string> {
  const encoder = new TextEncoder()
  const publicKey = getPublicKey(privateKey)

  // Derive encryption key from private key
  const keyMaterial = await crypto.subtle.importKey("raw", privateKey.slice(0, 32), { name: "PBKDF2" }, false, [
    "deriveKey",
  ])

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("nostr-journal-self-encrypt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(data))

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptFromSelf(encryptedData: string, privateKey: Uint8Array): Promise<string> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  // Derive the same encryption key
  const keyMaterial = await crypto.subtle.importKey("raw", privateKey.slice(0, 32), { name: "PBKDF2" }, false, [
    "deriveKey",
  ])

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("nostr-journal-self-encrypt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  )

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted)

  return decoder.decode(decrypted)
}

export async function saveNotesToNostr(
  notes: DecryptedNote[],
  deletedNotes: DeletedNote[] = [],
  privateKey: Uint8Array,
): Promise<NostrStorageResult> {
  try {
    console.log("[v0] Saving notes to Nostr network...")

    const publicKey = getPublicKey(privateKey)

    const notesData: NotesData = {
      notes,
      deletedNotes,
      version: 1,
    }

    const dataString = JSON.stringify(notesData)
    const encryptedData = await encryptForSelf(dataString, privateKey)

    // Create NIP-78 event
    const event: Event = {
      kind: APP_DATA_KIND,
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", APP_IDENTIFIER], // App identifier tag
        ["title", "Encrypted Journal Notes"],
        ["version", "1.0"],
      ],
      content: encryptedData,
    }

    const signedEvent = finalizeEvent(event, privateKey)
    console.log("[v0] Created signed event:", signedEvent.id)

    const publishPromises = RELAYS.map(async (relay) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const ws = new WebSocket(relay)

          const result = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
              ws.close()
              resolve(false)
            }, 15000) // Increased timeout to 15 seconds

            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", signedEvent]))
            }

            ws.onmessage = (event) => {
              const response = JSON.parse(event.data)
              if (response[0] === "OK" && response[1] === signedEvent.id) {
                clearTimeout(timeout)
                ws.close()
                resolve(response[2] === true)
              }
            }

            ws.onerror = () => {
              clearTimeout(timeout)
              ws.close()
              resolve(false)
            }
          })

          if (result) {
            console.log(`[v0] Successfully published to ${relay} on attempt ${attempt}`)
            return true
          }
        } catch (error) {
          console.error(`[v0] Error publishing to ${relay} (attempt ${attempt}):`, error)
        }

        if (attempt < 3) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        }
      }

      console.error(`[v0] Failed to publish to ${relay} after 3 attempts`)
      return false
    })

    const results = await Promise.all(publishPromises)
    const successCount = results.filter(Boolean).length

    console.log(`[v0] Published to ${successCount}/${RELAYS.length} relays`)

    return {
      success: successCount > 0,
      eventId: signedEvent.id,
      error: successCount === 0 ? "Failed to publish to any relay" : undefined,
    }
  } catch (error) {
    console.error("[v0] Error saving notes to Nostr:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function loadNotesFromNostr(
  privateKey: Uint8Array,
): Promise<{ notes: DecryptedNote[]; deletedNotes: DeletedNote[] }> {
  try {
    console.log("[v0] Loading notes from Nostr network...")

    const publicKey = getPublicKey(privateKey)

    // Query for our app data events
    const filter = {
      kinds: [APP_DATA_KIND],
      authors: [publicKey],
      "#d": [APP_IDENTIFIER],
      limit: 1,
    }

    for (const relay of RELAYS) {
      try {
        const ws = new WebSocket(relay)

        const events = await new Promise<Event[]>((resolve, reject) => {
          const foundEvents: Event[] = []
          const timeout = setTimeout(() => {
            ws.close()
            resolve(foundEvents)
          }, 10000) // Increased timeout to 10 seconds

          ws.onopen = () => {
            const subscription = Math.random().toString(36).substring(7)
            ws.send(JSON.stringify(["REQ", subscription, filter]))
          }

          ws.onmessage = (event) => {
            const response = JSON.parse(event.data)
            if (response[0] === "EVENT") {
              foundEvents.push(response[2])
            } else if (response[0] === "EOSE") {
              clearTimeout(timeout)
              ws.close()
              resolve(foundEvents)
            }
          }

          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(foundEvents)
          }
        })

        if (events.length > 0) {
          // Get the most recent event
          const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0]
          console.log("[v0] Found notes event:", latestEvent.id)

          // Decrypt the content
          const decryptedData = await decryptFromSelf(latestEvent.content, privateKey)

          let parsedData
          try {
            parsedData = JSON.parse(decryptedData)
          } catch (error) {
            console.error("[v0] Error parsing decrypted data:", error)
            continue // Try next relay
          }

          // Check if it's the new format with version
          if (parsedData.version && parsedData.notes) {
            const notes = parsedData.notes.map((note: any) => ({
              ...note,
              createdAt: new Date(note.createdAt),
              lastModified: note.lastModified ? new Date(note.lastModified) : new Date(note.createdAt),
            }))

            const deletedNotes = (parsedData.deletedNotes || []).map((deleted: any) => ({
              ...deleted,
              deletedAt: new Date(deleted.deletedAt),
            }))

            console.log(`[v0] Loaded ${notes.length} notes and ${deletedNotes.length} deleted notes from Nostr`)
            return { notes, deletedNotes }
          } else {
            // Old format - just an array of notes
            const notes = parsedData.map((note: any) => ({
              ...note,
              createdAt: new Date(note.createdAt),
              lastModified: note.lastModified ? new Date(note.lastModified) : new Date(note.createdAt),
            }))

            console.log(`[v0] Loaded ${notes.length} notes from Nostr (old format)`)
            return { notes, deletedNotes: [] }
          }
        }
      } catch (error) {
        console.error(`[v0] Error loading from ${relay}:`, error)
        continue
      }
    }

    console.log("[v0] No notes found on Nostr network")
    return { notes: [], deletedNotes: [] }
  } catch (error) {
    console.error("[v0] Error loading notes from Nostr:", error)
    return { notes: [], deletedNotes: [] }
  }
}

let syncInProgress = false
const syncQueue: (() => Promise<void>)[] = []

async function executeSyncQueue() {
  if (syncInProgress || syncQueue.length === 0) return

  syncInProgress = true
  const syncOperation = syncQueue.shift()

  if (syncOperation) {
    try {
      await syncOperation()
    } catch (error) {
      console.error("[v0] Sync operation failed:", error)
    }
  }

  syncInProgress = false

  // Process next item in queue
  if (syncQueue.length > 0) {
    setTimeout(executeSyncQueue, 1000) // Wait 1 second between sync operations
  }
}

export async function syncNotes(
  localNotes: DecryptedNote[],
  localDeletedNotes: DeletedNote[] = [],
  privateKey: Uint8Array,
): Promise<{ notes: DecryptedNote[]; deletedNotes: DeletedNote[]; synced: boolean }> {
  return new Promise((resolve) => {
    const syncOperation = async () => {
      try {
        console.log("[v0] Starting sync operation...")
        console.log("[v0] Local notes:", localNotes.length, "Deleted notes:", localDeletedNotes.length)

        // Load notes from Nostr with longer timeout for better reliability
        const { notes: nostrNotes, deletedNotes: nostrDeletedNotes } = await loadNotesFromNostr(privateKey)
        console.log("[v0] Remote notes:", nostrNotes.length, "Remote deleted:", nostrDeletedNotes.length)

        if (nostrNotes.length === 0 && localNotes.length > 0) {
          console.log("[v0] No remote notes found, uploading local notes...")
          const result = await saveNotesToNostr(localNotes, localDeletedNotes, privateKey)
          const syncedNotes = result.success
            ? localNotes.map((note) => ({ ...note, lastSynced: new Date() }))
            : localNotes
          resolve({ notes: syncedNotes, deletedNotes: localDeletedNotes, synced: result.success })
          return
        }

        if (nostrNotes.length > 0 && localNotes.length === 0) {
          console.log("[v0] No local notes found, using remote notes...")
          const syncedNotes = nostrNotes.map((note) => ({ ...note, lastSynced: new Date() }))
          resolve({ notes: syncedNotes, deletedNotes: nostrDeletedNotes, synced: true })
          return
        }

        console.log("[v0] Merging local and remote notes...")

        const mergedNotes = new Map<string, DecryptedNote>()
        const allDeletedNotes = new Map<string, number>()

        // Merge deleted notes - always use the most recent deletion timestamp
        localDeletedNotes.forEach((deleted) => {
          allDeletedNotes.set(deleted.id, deleted.deletedAt.getTime())
        })

        nostrDeletedNotes.forEach((deleted) => {
          const existingTimestamp = allDeletedNotes.get(deleted.id)
          if (!existingTimestamp || deleted.deletedAt.getTime() > existingTimestamp) {
            allDeletedNotes.set(deleted.id, deleted.deletedAt.getTime())
          }
        })

        console.log(`[v0] Total deleted notes after merge: ${allDeletedNotes.size}`)

        // Process all notes (local and remote) and exclude deleted ones
        const allNotes = new Map<string, DecryptedNote>()

        // Add local notes
        localNotes.forEach((note) => {
          if (!allDeletedNotes.has(note.id)) {
            allNotes.set(note.id, note)
          } else {
            console.log(`[v0] Excluding locally deleted note: ${note.title}`)
          }
        })

        // Add remote notes
        nostrNotes.forEach((nostrNote) => {
          if (!allDeletedNotes.has(nostrNote.id)) {
            const localNote = allNotes.get(nostrNote.id)
            if (!localNote) {
              console.log(`[v0] Adding new remote note: ${nostrNote.title}`)
              allNotes.set(nostrNote.id, { ...nostrNote, lastSynced: new Date() })
            } else {
              // Compare timestamps and keep the newer version
              const localModified = localNote.lastModified
                ? localNote.lastModified.getTime()
                : localNote.createdAt.getTime()
              const nostrModified = nostrNote.lastModified
                ? nostrNote.lastModified.getTime()
                : nostrNote.createdAt.getTime()

              if (nostrModified > localModified) {
                console.log(`[v0] Using newer remote version: ${nostrNote.title}`)
                allNotes.set(nostrNote.id, { ...nostrNote, lastSynced: new Date() })
              } else {
                console.log(`[v0] Keeping newer local version: ${localNote.title}`)
                // Don't mark as synced if we're keeping local version
              }
            }
          } else {
            console.log(`[v0] Excluding remotely deleted note: ${nostrNote.title}`)
          }
        })

        const finalNotes = Array.from(allNotes.values())
        const finalDeletedNotes = Array.from(allDeletedNotes.entries()).map(([id, deletedAt]) => ({
          id,
          deletedAt: new Date(deletedAt),
        }))

        // Improved logic for checking if we need to upload changes
        const unsyncedNotes = finalNotes.filter((note) => !note.lastSynced)
        const hasNewLocalNotes = localNotes.some((note) => !nostrNotes.find((n) => n.id === note.id))
        const hasDeleteChanges = localDeletedNotes.length > 0 || localDeletedNotes.length !== nostrDeletedNotes.length

        console.log(
          "[v0] Sync check - Unsynced:",
          unsyncedNotes.length,
          "New local:",
          hasNewLocalNotes,
          "Delete changes:",
          hasDeleteChanges,
        )

        if (unsyncedNotes.length > 0 || hasNewLocalNotes || hasDeleteChanges) {
          console.log(`[v0] Uploading changes to Nostr...`)

          const result = await saveNotesToNostr(finalNotes, finalDeletedNotes, privateKey)

          if (result.success) {
            const allSyncedNotes = finalNotes.map((note) => ({ ...note, lastSynced: new Date() }))
            console.log("[v0] Sync completed successfully")
            resolve({ notes: allSyncedNotes, deletedNotes: finalDeletedNotes, synced: true })
          } else {
            console.log("[v0] Sync failed to upload")
            resolve({ notes: finalNotes, deletedNotes: finalDeletedNotes, synced: false })
          }
        } else {
          console.log("[v0] No changes to sync")
          resolve({ notes: finalNotes, deletedNotes: finalDeletedNotes, synced: true })
        }
      } catch (error) {
        console.error("[v0] Sync operation failed:", error)
        resolve({ notes: localNotes, deletedNotes: localDeletedNotes, synced: false })
      }
    }

    // Add to sync queue
    syncQueue.push(syncOperation)
    executeSyncQueue()
  })
}
