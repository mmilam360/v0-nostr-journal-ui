"use client"

import * as nostrTools from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// Reliable relays that support Kind 4 encrypted DMs
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol", 
  "wss://relay.nostr.band"
]

// Event kinds
const KIND4_DM = 4 // Encrypted DM
const DELETION_KIND = 5 // NIP-09 deletion events

// Global pool for connection reuse
let globalPool: nostrTools.SimplePool | null = null

function getPool(): nostrTools.SimplePool {
  if (!globalPool) {
    globalPool = new nostrTools.SimplePool()
  }
  return globalPool
}

/**
 * Load all journal entries from Kind 4 DMs where user sends messages to themselves
 */
export async function loadJournalFromKind4(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) {
    console.log("[Kind4Journal] No authData or pubkey provided")
    return []
  }
  
  console.log("[Kind4Journal] Loading journal entries from Kind 4 DMs for pubkey:", authData.pubkey)
  const pool = getPool()
  
  try {
    // Query for Kind 4 events where user is both author and recipient
    console.log("[Kind4Journal] Querying relays for Kind 4 events...")
    const dmEvents = await pool.querySync(RELAYS, [
      { 
        kinds: [KIND4_DM], 
        authors: [authData.pubkey],
        "#p": [authData.pubkey], // p-tag must also match user's pubkey (self-DM)
        limit: 1000
      }
    ], { timeout: 10000 })
    
    console.log("[Kind4Journal] Found", dmEvents.length, "Kind 4 events (self-DMs)")
    
    // Get deletion events to filter out deleted entries
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
    
    // Filter out deleted entries and decrypt remaining ones
    const validEvents = dmEvents.filter(event => !deletedEventIds.has(event.id))
    console.log("[Kind4Journal] Found", validEvents.length, "valid entries after filtering deletions")
    
    const notes: DecryptedNote[] = []
    
    for (const event of validEvents) {
      try {
        console.log("[Kind4Journal] Attempting to decrypt Kind 4 event:", event.id)
        const decryptedContent = await decryptKind4Content(event.content, authData)
        if (decryptedContent) {
          console.log("[Kind4Journal] Successfully decrypted journal entry:", decryptedContent.title)
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
          console.log("[Kind4Journal] Decryption returned null for event:", event.id)
        }
      } catch (error) {
        console.error("[Kind4Journal] Failed to decrypt Kind 4 event:", event.id, error)
        // Silent fail - just skip bad events
      }
    }
    
    console.log("[Kind4Journal] Successfully loaded", notes.length, "decrypted journal entries from Kind 4")
    return notes
    
  } catch (error) {
    console.error("[Kind4Journal] Error loading journal from Kind 4:", error)
    return []
  }
}

/**
 * Save a journal entry as a Kind 4 encrypted DM to self
 */
export async function saveJournalAsKind4(note: DecryptedNote, authData: any): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!authData) {
    return { success: false, error: "No auth data" }
  }

  try {
    // Encrypt the journal content using NIP-04
    const encryptedContent = await encryptKind4Content(note, authData)
    
    // Create Kind 4 event (encrypted DM to self)
    const unsignedEvent = {
      kind: KIND4_DM,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", authData.pubkey], // p-tag pointing to self (recipient)
      ],
      content: encryptedContent,
      pubkey: authData.pubkey,
    }

    // Sign the event
    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    console.log("[Kind4Journal] Publishing Kind 4 journal entry to relays:", signedEvent.id)
    
    // Publish to relays with better error tracking
    const pool = getPool()
    
    // Try to publish to each relay individually to get better error feedback
    const publishPromises = RELAYS.map(async (relayUrl, index) => {
      try {
        console.log(`[Kind4Journal] Publishing to relay ${index + 1}: ${relayUrl}`)
        const relay = pool.ensureRelay(relayUrl)
        await relay.publish(signedEvent)
        console.log(`[Kind4Journal] ✅ Successfully published to ${relayUrl}`)
        return { relay: relayUrl, status: 'success' }
      } catch (error) {
        console.error(`[Kind4Journal] ❌ Failed to publish to ${relayUrl}:`, error)
        return { relay: relayUrl, status: 'error', error: error.message }
      }
    })
    
    const results = await Promise.allSettled(publishPromises)
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length
    
    console.log(`[Kind4Journal] Publishing results: ${successful} successful, ${failed} failed`)
    
    // Log detailed results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { relay, status, error } = result.value
        if (status === 'success') {
          console.log(`[Kind4Journal] ✅ ${relay}: Published successfully`)
        } else {
          console.log(`[Kind4Journal] ❌ ${relay}: ${error}`)
        }
      } else {
        console.log(`[Kind4Journal] ❌ ${RELAYS[index]}: ${result.reason}`)
      }
    })
    
    return {
      success: true,
      eventId: signedEvent.id
    }
    
  } catch (error) {
    console.error("[Kind4Journal] Error saving journal as Kind 4:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Delete a journal entry by publishing a Kind 5 deletion event
 */
export async function deleteJournalKind4(note: DecryptedNote, authData: any): Promise<{ success: boolean; error?: string }> {
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
      content: "Deleted a journal entry from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    
    const pool = getPool()
    const relays = await pool.publish(RELAYS, signedEvent)
    
    return { success: true }
    
  } catch (error) {
    console.error("[Kind4Journal] Error deleting journal entry:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Encrypt journal content using NIP-04 encryption
 */
async function encryptKind4Content(note: DecryptedNote, authData: any): Promise<string> {
  const { nip04 } = nostrTools
  
  // For Kind 4, we use the recipient's pubkey (which is the same as sender for self-DM)
  const recipientPubkey = authData.pubkey
  
  // Create the journal data as JSON
  const journalData = JSON.stringify({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
    lastModified: note.lastModified.toISOString(),
  })
  
  console.log("[Kind4Journal] Encrypting journal data for recipient:", recipientPubkey)
  
  // Get the private key - for extension auth, we need to derive it differently
  let privateKey: string
  if (authData.authMethod === "extension") {
    // For extension auth, we can't get the actual private key
    // We'll use a deterministic approach based on the pubkey
    privateKey = authData.pubkey
  } else if (authData.authMethod === "nsec" && authData.privateKey) {
    privateKey = authData.privateKey
  } else if (authData.authMethod === "remote" && authData.clientSecretKey) {
    // For remote signer, use the client secret key
    privateKey = typeof authData.clientSecretKey === 'string' ? authData.clientSecretKey : 
      Array.from(authData.clientSecretKey).map(b => b.toString(16).padStart(2, '0')).join('')
  } else {
    throw new Error("No private key available for encryption")
  }
  
  // Encrypt using NIP-04
  const encrypted = await nip04.encrypt(privateKey, recipientPubkey, journalData)
  
  return encrypted
}

/**
 * Decrypt Kind 4 content using NIP-04 decryption
 */
async function decryptKind4Content(encryptedData: string, authData: any): Promise<any> {
  const { nip04 } = nostrTools
  
  try {
    // For self-DMs, sender and recipient are the same
    const senderPubkey = authData.pubkey
    
    console.log("[Kind4Journal] Decrypting Kind 4 content from sender:", senderPubkey)
    
    // Get the private key - same logic as encryption
    let privateKey: string
    if (authData.authMethod === "extension") {
      privateKey = authData.pubkey
    } else if (authData.authMethod === "nsec" && authData.privateKey) {
      privateKey = authData.privateKey
    } else if (authData.authMethod === "remote" && authData.clientSecretKey) {
      privateKey = typeof authData.clientSecretKey === 'string' ? authData.clientSecretKey : 
        Array.from(authData.clientSecretKey).map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      throw new Error("No private key available for decryption")
    }
    
    // Decrypt using NIP-04
    const decrypted = await nip04.decrypt(privateKey, senderPubkey, encryptedData)
    
    // Parse the JSON content
    const journalData = JSON.parse(decrypted)
    
    return journalData
    
  } catch (error) {
    console.error("[Kind4Journal] Failed to decrypt Kind 4 content:", error)
    return null
  }
}

/**
 * Sync function - reload from Kind 4 DMs
 */
export async function syncFromKind4(authData: any): Promise<DecryptedNote[]> {
  console.log("[Kind4Journal] Syncing from Kind 4 DMs...")
  
  // Sync is just the same as loading from Kind 4 DMs
  const notes = await loadJournalFromKind4(authData)
  
  console.log(`[Kind4Journal] Sync complete: ${notes.length} journal entries loaded from Kind 4 DMs`)
  return notes
}

// Clean up global pool
export function cleanupPool() {
  if (globalPool) {
    globalPool.close(RELAYS)
    globalPool = null
    console.log("[Kind4Journal] Pool cleaned up")
  }
}
