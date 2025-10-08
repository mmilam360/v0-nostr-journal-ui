"use client"

import * as nostrTools from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// Simple, reliable relay list - only use proven relays
const SIMPLE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net", 
  "wss://nos.lol",
  "wss://relay.nostr.band"
]

// Simple pool - no persistent connections, just use when needed
let pool: nostrTools.SimplePool | null = null

function getPool(): nostrTools.SimplePool {
  if (!pool) {
    pool = new nostrTools.SimplePool()
  }
  return pool
}

// Simple note fetching - just get notes, no complex merging
export async function fetchNotesFromNostr(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) return []
  
  try {
    console.log("[SimpleNostr] Fetching notes from relays...")
    
    const pool = getPool()
    const filters = [
      { 
        kinds: [30078], 
        authors: [authData.pubkey],
        limit: 100 // Reasonable limit
      }
    ]
    
    const events = await pool.list(SIMPLE_RELAYS, filters)
    console.log(`[SimpleNostr] Found ${events.length} events`)
    
    // Simple decryption - no caching complexity
    const notes: DecryptedNote[] = []
    
    for (const event of events) {
      try {
        // Check if it's our app
        const clientTag = event.tags.find((tag: any[]) => tag[0] === "client")
        if (clientTag && clientTag[1] === "nostr-journal") {
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
        }
      } catch (error) {
        console.warn("[SimpleNostr] Failed to decrypt event:", event.id, error)
        // Continue with other events
      }
    }
    
    console.log(`[SimpleNostr] Successfully decrypted ${notes.length} notes`)
    return notes
    
  } catch (error) {
    console.error("[SimpleNostr] Error fetching notes:", error)
    return []
  }
}

// Simple note saving - just publish, no complex retry logic
export async function saveNoteToNostr(note: DecryptedNote, authData: any): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!authData) {
    return { success: false, error: "No auth data" }
  }

  try {
    console.log("[SimpleNostr] Saving note:", note.title)
    
    const encryptedContent = await encryptNoteContent(note, authData)
    const dTag = `nostrjournal_note_${note.id}`

    const unsignedEvent = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", dTag],
        ["client", "nostr-journal"],
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
    
    // Publish to relays
    const pool = getPool()
    const relays = await pool.publish(SIMPLE_RELAYS, signedEvent)
    
    console.log(`[SimpleNostr] Published to ${relays.length} relays`)
    
    return {
      success: true,
      eventId: signedEvent.id
    }
    
  } catch (error) {
    console.error("[SimpleNostr] Error saving note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Simple note deletion
export async function deleteNoteFromNostr(note: DecryptedNote, authData: any): Promise<{ success: boolean; error?: string }> {
  if (!note.eventId) {
    return { success: false, error: "No event ID to delete" }
  }

  try {
    console.log("[SimpleNostr] Deleting note:", note.title)
    
    const deletionEvent = {
      kind: 5, // NIP-09 deletion
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", note.eventId]],
      content: "Deleted a note from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    
    const pool = getPool()
    await pool.publish(SIMPLE_RELAYS, signedEvent)
    
    console.log("[SimpleNostr] Deletion event published")
    
    return { success: true }
    
  } catch (error) {
    console.error("[SimpleNostr] Error deleting note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Simple encryption - reuse existing logic but simplified
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

// Clean up pool when done
export function cleanupPool() {
  if (pool) {
    pool.close(SIMPLE_RELAYS)
    pool = null
  }
}
