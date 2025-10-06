"use client"

import { NostrFetcher } from "nostr-fetch"
import * as nostrTools from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { getSmartRelayList, getRelays } from "./relay-manager"
import { encryptWithRemote, decryptWithRemote, signEventWithRemote } from "./signer-manager"

// ===================================================================================
// SMART RELAY MANAGEMENT: Dynamic relay selection with health checking
// ===================================================================================
let cachedRelays: string[] = []
let lastRelayCheck = 0
const RELAY_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const APP_D_TAG_PREFIX = "nostrjournal_note_"

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

// Enhanced encryption for individual notes with remote signer support
async function encryptNote(note: DecryptedNote, authData: any): Promise<string> {
  const noteData = JSON.stringify(note)

  // For remote signer, use local encryption with pubkey-based key (same as extension)
  // Remote signer doesn't expose private key for encryption, only for signing
  if (authData.authMethod === "remote") {
    console.log("[v0] 🔐 Encrypting note with local encryption (remote signer)")
    // Use same encryption as extension - pubkey-based key
    const encoder = new TextEncoder()
    const encryptionKey = encoder.encode(authData.pubkey).slice(0, 32)
    
    const keyMaterial = await crypto.subtle.importKey("raw", encryptionKey.slice(0, 32), { name: "PBKDF2" }, false, [
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
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(noteData))

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  }

  // For nsec/extension, use local encryption (existing code)
  const encoder = new TextEncoder()
  let encryptionKey: Uint8Array

  if (authData.authMethod === "nsec" && authData.privateKey) {
    encryptionKey = new Uint8Array(
      authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || []
    )
  } else {
    encryptionKey = encoder.encode(authData.pubkey).slice(0, 32)
  }

  const keyMaterial = await crypto.subtle.importKey("raw", encryptionKey.slice(0, 32), { name: "PBKDF2" }, false, [
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
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(noteData))

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptNote(encryptedData: string, authData: any): Promise<DecryptedNote> {
  // All auth methods now use local decryption (remote signer uses same as extension)

  // For nsec/extension, use local decryption (existing code)
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  let encryptionKey: Uint8Array

  if (authData.authMethod === "nsec" && authData.privateKey) {
    encryptionKey = new Uint8Array(
      authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || []
    )
  } else {
    encryptionKey = encoder.encode(authData.pubkey).slice(0, 32)
  }

  const keyMaterial = await crypto.subtle.importKey("raw", encryptionKey.slice(0, 32), { name: "PBKDF2" }, false, [
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
  const noteData = JSON.parse(decoder.decode(decrypted))

  return {
    ...noteData,
    createdAt: new Date(noteData.createdAt),
    lastModified: noteData.lastModified ? new Date(noteData.lastModified) : new Date(noteData.createdAt),
  }
}

// Get current relay list with caching
async function getCurrentRelays(): Promise<string[]> {
  const now = Date.now()
  
  if (cachedRelays.length > 0 && (now - lastRelayCheck) < RELAY_CACHE_DURATION) {
    return cachedRelays
  }
  
  try {
    cachedRelays = await getSmartRelayList()
    lastRelayCheck = now
    console.log("[v0] 🔄 Updated relay list:", cachedRelays)
  } catch (error) {
    console.warn("[v0] ⚠️ Failed to get smart relay list, using fallback:", error)
    cachedRelays = getRelays()
  }
  
  return cachedRelays
}

// Fetches all individual note events with smart relay management
export const fetchAllNotesFromNostr = async (authData: any): Promise<DecryptedNote[]> => {
  if (!authData?.pubkey) return []

  const fetcher = NostrFetcher.init()
  try {
    const relays = await getCurrentRelays()
    console.log("[v0] 📡 Fetching notes from relays:", relays)

    const events = await fetcher.fetchAllEvents(
      relays,
      { kinds: [30078], authors: [authData.pubkey] },
      { sort: true }, // Sort by created_at descending
    )

    console.log(`[v0] Found ${events.length} note events`)

    // Filter events that have our app's d tag prefix
    const appEvents = events.filter((event) => {
      const dTag = event.tags.find((tag) => tag[0] === "d")
      return dTag && dTag[1]?.startsWith(APP_D_TAG_PREFIX)
    })

    console.log(`[v0] Filtered to ${appEvents.length} app-specific events`)

    const notes = await Promise.all(
      appEvents.map(async (event) => {
        try {
          const note = await decryptNote(event.content, authData)
          // Store the event ID on the note object to enable deletion later
          note.eventId = event.id
          return note
        } catch (error) {
          console.error("[v0] Error decrypting note:", error)
          return null
        }
      }),
    )

    return notes.filter((note): note is DecryptedNote => note !== null)
  } catch (error) {
    console.error("[v0] ❌ Error fetching notes from Nostr:", error)
    
    // If this is a network error, try with fallback relays
    if (error instanceof Error && (
      error.message.includes('timeout') || 
      error.message.includes('connection') ||
      error.message.includes('network')
    )) {
      console.log("[v0] 🔄 Network error detected, trying fallback relays...")
      try {
        const fallbackRelays = getRelays()
        const fallbackEvents = await fetcher.fetchAllEvents(
          fallbackRelays,
          { kinds: [30078], authors: [authData.pubkey] },
          { sort: true }
        )
        
        const fallbackAppEvents = fallbackEvents.filter((event) => {
          const dTag = event.tags.find((tag) => tag[0] === "d")
          return dTag && dTag[1]?.startsWith(APP_D_TAG_PREFIX)
        })
        
        const fallbackNotes = await Promise.all(
          fallbackAppEvents.map(async (event) => {
            try {
              const note = await decryptNote(event.content, authData)
              note.eventId = event.id
              return note
            } catch (error) {
              console.error("[v0] Error decrypting fallback note:", error)
              return null
            }
          }),
        )
        
        console.log(`[v0] ✅ Fallback fetch successful: ${fallbackNotes.filter(n => n !== null).length} notes`)
        return fallbackNotes.filter((note): note is DecryptedNote => note !== null)
      } catch (fallbackError) {
        console.error("[v0] ❌ Fallback fetch also failed:", fallbackError)
      }
    }
    
    return []
  } finally {
    fetcher.shutdown()
  }
}

// Saves a SINGLE note as its own event
export const saveNoteToNostr = async (
  note: DecryptedNote,
  authData: any,
): Promise<NostrStorageResult> => {
  if (!authData) {
    return { success: false, error: "Auth failed" }
  }

  try {
    console.log("[v0] Saving individual note to Nostr:", note.title)

    // Encrypt with the appropriate method
    const encryptedContent = await encryptNote(note, authData)
    const dTag = `${APP_D_TAG_PREFIX}${note.id}`

    const unsignedEvent: any = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", dTag]],
      content: encryptedContent,
      pubkey: authData.pubkey,
    }

    // Sign the event
    let signedEvent

    switch (authData.authMethod) {
      case "nsec":
        if (!authData.privateKey) {
          throw new Error("Private key is missing for nsec login method.")
        }
        const pkBytes = new Uint8Array(
          authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
        )
        signedEvent = nostrTools.finalizeEvent(unsignedEvent, pkBytes)
        console.log("[v0] Event signed locally using private key.")
        break

      case "remote":
        if (!authData.bunkerUri || !authData.clientSecretKey) {
          throw new Error("Remote signer connection data is missing.")
        }

        // Use the signer manager - NO popup required!
        signedEvent = await signEventWithRemote(unsignedEvent, authData)
        console.log("[v0] Event signed by remote signer.")
        break

      case "extension":
        if (typeof window.nostr === "undefined") {
          throw new Error("Nostr browser extension not found.")
        }
        signedEvent = await window.nostr.signEvent(unsignedEvent)
        console.log("[v0] Received signed event from browser extension.")
        break

      default:
        throw new Error("Unsupported authentication method.")
    }

    // Publish using SimplePool (same as nostr-publish.ts)
    const relays = await getCurrentRelays()
    console.log("[v0] 📤 Publishing note event to relays:", relays)
    
    const pool = new nostrTools.SimplePool()
    try {
      await Promise.any(pool.publish(relays, signedEvent))
      console.log("[v0] ✅ Successfully published note:", signedEvent.id)

      return {
        success: true,
        eventId: signedEvent.id,
      }
    } finally {
      pool.close(relays)
    }
  } catch (error) {
    console.error("[v0] Error saving note to Nostr:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ===================================================================================
// THE "NOSTR DELETE" SECRET: The NIP-09 `kind: 5` deletion function.
// ===================================================================================
export const deleteNoteOnNostr = async (noteToDelete: DecryptedNote, authData: any): Promise<void> => {
  if (!noteToDelete.eventId) {
    console.warn("[v0] Cannot delete note from Nostr: event ID is missing.")
    return
  }

  try {
    console.log("[v0] Creating NIP-09 deletion event for:", noteToDelete.title)

    const unsignedEvent: any = {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", noteToDelete.eventId]],
      content: "Deleted a note from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    let signedEvent

    switch (authData.authMethod) {
      case "nsec":
        if (!authData.privateKey) {
          throw new Error("Private key is missing for nsec login method.")
        }
        const pkBytes = new Uint8Array(
          authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
        )
        signedEvent = nostrTools.finalizeEvent(unsignedEvent, pkBytes)
        console.log("[v0] Deletion event signed locally.")
        break

      case "remote":
        if (!authData.bunkerUri || !authData.clientSecretKey) {
          throw new Error("Remote signer connection data is missing.")
        }

        // Use signer manager
        signedEvent = await signEventWithRemote(unsignedEvent, authData)
        console.log("[v0] Deletion event signed by remote signer.")
        break

      case "extension":
        if (typeof window.nostr === "undefined") {
          throw new Error("Nostr browser extension not found.")
        }
        signedEvent = await window.nostr.signEvent(unsignedEvent)
        console.log("[v0] Deletion event signed by browser extension.")
        break

      default:
        throw new Error("Unsupported authentication method.")
    }

    const relays = await getCurrentRelays()
    console.log(`[v0] 📤 Publishing kind:5 deletion for event ${noteToDelete.eventId}`)
    
    const pool = new nostrTools.SimplePool()
    try {
      await Promise.any(pool.publish(relays, signedEvent))
      console.log("[v0] ✅ Successfully published deletion event")
    } finally {
      pool.close(relays)
    }
  } catch (error) {
    console.error("[v0] Error publishing deletion event:", error)
    throw error
  }
}

// Legacy sync function - now deprecated but kept for compatibility
export async function syncNotes(
  localNotes: DecryptedNote[],
  localDeletedNotes: DeletedNote[] = [],
  authData: any,
): Promise<{ notes: DecryptedNote[]; deletedNotes: DeletedNote[]; synced: boolean }> {
  console.log("[v0] Legacy syncNotes called - this will be replaced with individual note syncing")

  try {
    // Fetch all notes from Nostr
    const nostrNotes = await fetchAllNotesFromNostr(authData)

    // For now, just return the fetched notes
    // TODO: Implement proper merging logic
    return {
      notes: nostrNotes,
      deletedNotes: localDeletedNotes,
      synced: true,
    }
  } catch (error) {
    console.error("[v0] Error in syncNotes:", error)
    return {
      notes: localNotes,
      deletedNotes: localDeletedNotes,
      synced: false,
    }
  }
}

// Legacy functions kept for compatibility
export async function saveNotesToNostr(
  notes: DecryptedNote[],
  deletedNotes: DeletedNote[] = [],
  authData: any,
): Promise<NostrStorageResult> {
  console.log("[v0] Legacy saveNotesToNostr called - migrating to individual note saves")

  try {
    // Save each note individually
    const results = await Promise.all(notes.map((note) => saveNoteToNostr(note, authData)))

    const successCount = results.filter((r) => r.success).length

    return {
      success: successCount > 0,
      error: successCount === 0 ? "Failed to save any notes" : undefined,
    }
  } catch (error) {
    console.error("[v0] Error in saveNotesToNostr:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function loadNotesFromNostr(
  authData: any,
): Promise<{ notes: DecryptedNote[]; deletedNotes: DeletedNote[] }> {
  console.log("[v0] Legacy loadNotesFromNostr called - using new fetch method")

  try {
    const notes = await fetchAllNotesFromNostr(authData)

    return {
      notes,
      deletedNotes: [],
    }
  } catch (error) {
    console.error("[v0] Error in loadNotesFromNostr:", error)
    return {
      notes: [],
      deletedNotes: [],
    }
  }
}
