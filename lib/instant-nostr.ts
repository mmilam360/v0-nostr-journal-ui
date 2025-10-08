"use client"

import * as nostrTools from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// Only use the most reliable relays for instant loading
const INSTANT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol", 
  "wss://relay.primal.net"
]

// Global pool - keep it alive for instant responses
let globalPool: nostrTools.SimplePool | null = null

function getGlobalPool(): nostrTools.SimplePool {
  if (!globalPool) {
    globalPool = new nostrTools.SimplePool()
    console.log("[InstantNostr] Global pool initialized")
  }
  return globalPool
}

// INSTANT loading - like nostrudel, load everything from relays immediately
export async function loadAllNotesFromRelays(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) return []
  
  console.log("[InstantNostr] Loading ALL notes from relays instantly...")
  
  const pool = getGlobalPool()
  const filters = [
    { 
      kinds: [30078], 
      authors: [authData.pubkey],
      limit: 1000 // Get everything
    }
  ]
  
  // Use querySync for instant results - this is what nostrudel uses
  try {
    const events = await pool.querySync(INSTANT_RELAYS, filters, { timeout: 5000 })
    console.log(`[InstantNostr] Instantly loaded ${events.length} events from relays`)
    
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
        console.warn("[InstantNostr] Failed to decrypt event:", event.id, error)
      }
    }
    
    console.log(`[InstantNostr] Successfully loaded ${notes.length} notes instantly`)
    return notes
    
  } catch (error) {
    console.error("[InstantNostr] Error loading notes:", error)
    return []
  }
}

// INSTANT saving - publish and return immediately
export async function saveNoteInstantly(note: DecryptedNote, authData: any): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!authData) {
    return { success: false, error: "No auth data" }
  }

  try {
    console.log("[InstantNostr] Saving note instantly:", note.title)
    
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

    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    
    // Publish instantly - don't wait for confirmations
    const pool = getGlobalPool()
    pool.publish(INSTANT_RELAYS, signedEvent)
    
    console.log("[InstantNostr] Note published instantly with ID:", signedEvent.id)
    
    return {
      success: true,
      eventId: signedEvent.id
    }
    
  } catch (error) {
    console.error("[InstantNostr] Error saving note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// INSTANT deletion
export async function deleteNoteInstantly(note: DecryptedNote, authData: any): Promise<{ success: boolean; error?: string }> {
  if (!note.eventId) {
    return { success: false, error: "No event ID to delete" }
  }

  try {
    console.log("[InstantNostr] Deleting note instantly:", note.title)
    
    const deletionEvent = {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", note.eventId]],
      content: "Deleted a note from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    
    const pool = getGlobalPool()
    pool.publish(INSTANT_RELAYS, signedEvent)
    
    console.log("[InstantNostr] Deletion event published instantly")
    
    return { success: true }
    
  } catch (error) {
    console.error("[InstantNostr] Error deleting note:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Simple encryption (reused from simple-nostr-storage.ts)
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

// Clean up global pool
export function cleanupGlobalPool() {
  if (globalPool) {
    globalPool.close(INSTANT_RELAYS)
    globalPool = null
    console.log("[InstantNostr] Global pool cleaned up")
  }
}
