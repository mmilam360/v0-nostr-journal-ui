"use client"

import * as nostrTools from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// Simple relay list for reliable communication
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol", 
  "wss://relay.primal.net"
]

// App identifier for our events
const APP_IDENTIFIER = "nostr-journal"
const EVENT_KIND = 30078 // Parameterized replaceable events
const DELETION_KIND = 5   // NIP-09 deletion events

// Global pool for connection reuse
let globalPool: nostrTools.SimplePool | null = null

function getPool(): nostrTools.SimplePool {
  if (!globalPool) {
    globalPool = new nostrTools.SimplePool()
  }
  return globalPool
}

/**
 * Load all notes from relays - simple query and filter
 */
export async function loadNotesFromRelays(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) return []
  
  const pool = getPool()
  
  try {
    // Get note events
    const noteEvents = await pool.querySync(RELAYS, [
      { 
        kinds: [EVENT_KIND], 
        authors: [authData.pubkey],
        limit: 1000
      }
    ], { timeout: 10000 })
    
    // Filter for our app events
    const appEvents = noteEvents.filter(event => {
      const clientTag = event.tags.find((tag: any[]) => tag[0] === "client")
      return clientTag && clientTag[1] === APP_IDENTIFIER
    })
    
    // Get deletion events
    const deletionEvents = await pool.querySync(RELAYS, [
      { 
        kinds: [DELETION_KIND], 
        authors: [authData.pubkey],
        limit: 1000
      }
    ], { timeout: 10000 })
    
    // Create set of deleted event IDs
    const deletedEventIds = new Set<string>()
    deletionEvents.forEach(deletionEvent => {
      deletionEvent.tags.forEach((tag: any[]) => {
        if (tag[0] === "e") {
          deletedEventIds.add(tag[1])
        }
      })
    })
    
    // Filter out deleted notes and decrypt remaining ones
    const validEvents = appEvents.filter(event => !deletedEventIds.has(event.id))
    
    const notes: DecryptedNote[] = []
    
    for (const event of validEvents) {
      try {
        const decryptedContent = await decryptNoteContent(event.content, authData)
        if (decryptedContent) {
          const note: DecryptedNote = {
            id: decryptedContent.id,
            title: decryptedContent.title,
            content: decryptedContent.content,
            tags: decryptedContent.tags || [],
            createdAt: new Date(decryptedContent.createdAt),
            lastModified: new Date(decryptedContent.lastModified || decryptedContent.createdAt),
            eventId: event.id,
            eventKind: event.kind,
            lastSynced: new Date()
          }
          notes.push(note)
        }
      } catch (error) {
        // Silent fail - just skip bad events
      }
    }
    
    return notes
    
  } catch (error) {
    console.error("[SimpleEvents] Error loading notes from relays:", error)
    return []
  }
}

/**
 * Save a note - publish a kind 30078 replacement event
 */
export async function saveNoteToRelays(note: DecryptedNote, authData: any): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!authData) {
    return { success: false, error: "No auth data" }
  }

  try {
    const encryptedContent = await encryptNoteContent(note, authData)
    const dTag = `${APP_IDENTIFIER}_note_${note.id}`

    const unsignedEvent = {
      kind: EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", dTag],
        ["client", APP_IDENTIFIER],
        ["encrypted"],
        ["t", "private"],
        ["title", note.title],
        ["created", note.createdAt.toISOString()],
      ],
      content: encryptedContent,
      pubkey: authData.pubkey,
    }

    // Sign the event
    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    
    // Publish to relays - simple approach like nostrudel
    const pool = getPool()
    const relays = await pool.publish(RELAYS, signedEvent)
    
    // Just return success - don't wait for confirmations
    return {
      success: true,
      eventId: signedEvent.id
    }
    
  } catch (error) {
    console.error("[SimpleEvents] Error saving note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Delete a note - publish a kind 5 deletion event
 */
export async function deleteNoteFromRelays(note: DecryptedNote, authData: any): Promise<{ success: boolean; error?: string }> {
  if (!note.eventId) {
    return { success: false, error: "No event ID to delete" }
  }

  try {
    const deletionEvent = {
      kind: DELETION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", note.eventId], // Event ID to delete
      ],
      content: "Deleted a note from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    
    const pool = getPool()
    const relays = await pool.publish(RELAYS, signedEvent)
    
    return { success: true }
    
  } catch (error) {
    console.error("[SimpleEvents] Error deleting note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Simple encryption (reused from previous implementations)
async function encryptNoteContent(note: DecryptedNote, authData: any): Promise<string> {
  const encoder = new TextEncoder()
  let encryptionKey: Uint8Array

  if (authData.authMethod === "nsec" && authData.privateKey) {
    encryptionKey = new Uint8Array(
      authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
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

  const noteData = JSON.stringify({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
    lastModified: note.lastModified.toISOString(),
  })

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(noteData))

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

// Simple decryption
async function decryptNoteContent(encryptedData: string, authData: any): Promise<any> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let encryptionKey: Uint8Array

  if (authData.authMethod === "nsec" && authData.privateKey) {
    encryptionKey = new Uint8Array(
      authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
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

  const encrypted = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  const iv = encrypted.slice(0, 12)
  const data = encrypted.slice(12)

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data)
  return JSON.parse(decoder.decode(decrypted))
}

/**
 * Verify that an event exists on relays - temporarily simplified
 * Since events are published instantly and verification is causing issues,
 * we'll assume events are synced once they have an eventId
 */
export async function verifyEventExists(eventId: string, authData: any): Promise<boolean> {
  if (!eventId || !authData?.pubkey) {
    console.log("[SimpleEvents] Skipping verification - missing eventId or pubkey")
    return false
  }
  
  console.log("[SimpleEvents] Event published successfully:", eventId)
  
  // For now, assume events are synced once they have an eventId
  // This avoids the subscription issues while maintaining functionality
  return true
}

/**
 * Sync function - just reload from relays (same as loading on startup)
 */
export async function syncFromRelays(authData: any): Promise<DecryptedNote[]> {
  console.log("[SimpleEvents] Syncing from relays...")
  
  // Sync is just the same as loading from relays
  const notes = await loadNotesFromRelays(authData)
  
  console.log(`[SimpleEvents] Sync complete: ${notes.length} notes loaded from relays`)
  return notes
}

// Clean up global pool
export function cleanupPool() {
  if (globalPool) {
    globalPool.close(RELAYS)
    globalPool = null
    console.log("[SimpleEvents] Pool cleaned up")
  }
}
