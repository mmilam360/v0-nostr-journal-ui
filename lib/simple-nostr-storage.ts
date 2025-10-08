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

// Simple note fetching - use proper subscription like nostrudel
export async function fetchNotesFromNostr(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) return []
  
  try {
    console.log("[SimpleNostr] Fetching notes from relays...")
    console.log("[SimpleNostr] User pubkey:", authData.pubkey)
    
    const pool = getPool()
    const filters = [
      { 
        kinds: [30078], 
        authors: [authData.pubkey],
        limit: 100
      }
    ]
    
    // Use proper subscription method that waits for responses
    const events = await new Promise<any[]>((resolve, reject) => {
      const collectedEvents: any[] = []
      const sub = pool.sub(SIMPLE_RELAYS, filters)
      
      const timeout = setTimeout(() => {
        console.log(`[SimpleNostr] Timeout reached, collected ${collectedEvents.length} events`)
        sub.unsub()
        resolve(collectedEvents)
      }, 10000) // 10 second timeout
      
      sub.on('event', (event: any) => {
        console.log("[SimpleNostr] Received event:", event.id, "kind:", event.kind)
        collectedEvents.push(event)
      })
      
      sub.on('eose', () => {
        console.log("[SimpleNostr] End of stored events received")
        clearTimeout(timeout)
        sub.unsub()
        resolve(collectedEvents)
      })
      
      sub.on('error', (error: any) => {
        console.error("[SimpleNostr] Subscription error:", error)
        clearTimeout(timeout)
        sub.unsub()
        reject(error)
      })
    })
    
    console.log(`[SimpleNostr] Collected ${events.length} events from relays`)
    
    // Process and decrypt events
    const notes: DecryptedNote[] = []
    
    for (const event of events) {
      try {
        console.log("[SimpleNostr] Processing event:", event.id)
        console.log("[SimpleNostr] Event tags:", event.tags)
        
        // Check if it's our app by looking for the client tag
        const clientTag = event.tags.find((tag: any[]) => tag[0] === "client")
        if (clientTag && clientTag[1] === "nostr-journal") {
          console.log("[SimpleNostr] Found nostr-journal event:", event.id)
          
          const decryptedContent = await decryptNoteContent(event.content, authData)
          if (decryptedContent) {
            console.log("[SimpleNostr] Successfully decrypted:", decryptedContent.title)
            
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
          } else {
            console.warn("[SimpleNostr] Failed to decrypt content for event:", event.id)
          }
        } else {
          console.log("[SimpleNostr] Skipping non-nostr-journal event:", event.id)
        }
      } catch (error) {
        console.warn("[SimpleNostr] Failed to process event:", event.id, error)
        // Continue with other events
      }
    }
    
    console.log(`[SimpleNostr] Successfully processed ${notes.length} notes from relays`)
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
    console.log("[SimpleNostr] User pubkey:", authData.pubkey)
    
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

    console.log("[SimpleNostr] Event tags:", unsignedEvent.tags)
    console.log("[SimpleNostr] Event pubkey:", unsignedEvent.pubkey)

    // Sign the event
    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    console.log("[SimpleNostr] Signed event ID:", signedEvent.id)
    
    // Publish to relays
    const pool = getPool()
    console.log("[SimpleNostr] Publishing to relays:", SIMPLE_RELAYS)
    
    const relays = await pool.publish(SIMPLE_RELAYS, signedEvent)
    console.log(`[SimpleNostr] Published to ${relays.length} relays:`, relays)
    
    // Verify the event was published by checking if we can fetch it back
    console.log("[SimpleNostr] Verifying publication by fetching back...")
    setTimeout(async () => {
      try {
        const verifyEvents = await new Promise<any[]>((resolve) => {
          const collectedEvents: any[] = []
          const sub = pool.sub(SIMPLE_RELAYS, [
            { 
              kinds: [30078], 
              authors: [authData.pubkey],
              ids: [signedEvent.id]
            }
          ])
          
          const timeout = setTimeout(() => {
            sub.unsub()
            resolve(collectedEvents)
          }, 5000)
          
          sub.on('event', (event: any) => {
            console.log("[SimpleNostr] ✅ Verification: Found published event on relay:", event.id)
            collectedEvents.push(event)
          })
          
          sub.on('eose', () => {
            clearTimeout(timeout)
            sub.unsub()
            resolve(collectedEvents)
          })
        })
        
        if (verifyEvents.length > 0) {
          console.log("[SimpleNostr] ✅ SUCCESS: Event confirmed on relays!")
        } else {
          console.log("[SimpleNostr] ❌ WARNING: Event not found on relays after publishing")
        }
      } catch (error) {
        console.error("[SimpleNostr] Verification error:", error)
      }
    }, 2000) // Wait 2 seconds before verifying
    
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
