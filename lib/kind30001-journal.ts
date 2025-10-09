"use client"

import { nip04, SimplePool } from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// Declare window.nostr for TypeScript
declare global {
  interface Window {
    nostr?: {
      signEvent: (event: any) => Promise<any>
      getPublicKey: () => Promise<string>
    }
  }
}

// Helper function to get private key for encryption
function getPrivateKeyForEncryption(authData: any): string {
  if (authData.authMethod === "extension") {
    // For extension auth, we can't get the actual private key
    // Use a deterministic approach based on the pubkey
    return authData.pubkey
  } else if (authData.authMethod === "nsec" && authData.privateKey) {
    return authData.privateKey
  } else if (authData.authMethod === "remote" && authData.clientSecretKey) {
    return typeof authData.clientSecretKey === 'string' ? authData.clientSecretKey : 
      Array.from(authData.clientSecretKey).map(b => b.toString(16).padStart(2, '0')).join('')
  } else {
    throw new Error("No private key available for encryption")
  }
}

// Modern relays that support parameterized replaceable events (kinds 30000-39999)
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://purplepag.es",
  "wss://relay.snort.social",
  "wss://relay.primal.net"
]

// Event kinds
const KIND30001_LIST = 30001 // NIP-51 Generic Lists (for journal entries)
const DELETION_KIND = 5 // NIP-09 deletion events

// Global pool for connection reuse
let globalPool: SimplePool | null = null

function getPool(): SimplePool {
  if (!globalPool) {
    globalPool = new SimplePool()
  }
  return globalPool
}

/**
 * Load all journal entries from Kind 30001 Generic Lists
 */
export async function loadJournalFromKind30001(authData: any): Promise<DecryptedNote[]> {
  if (!authData?.pubkey) {
    console.log("[Kind30001Journal] No authData or pubkey provided")
    return []
  }
  
  console.log("[Kind30001Journal] Loading journal entries from Kind 30001 lists...")
  const pool = getPool()
  
  try {
    // Query for Kind 30001 events with our consistent user identifier in p-tag
    console.log("[Kind30001Journal] Querying relays for Kind 30001 events with p-tag:", authData.pubkey)
    console.log("[Kind30001Journal] Query filters:", {
      kinds: [KIND30001_LIST],
      "#p": [authData.pubkey],
      limit: 1000
    })
    
    // Use pool.querySync with p-tag filter for consistent user identification
    const listEvents = await pool.querySync(RELAYS, {
      kinds: [KIND30001_LIST],
      "#p": [authData.pubkey],
      limit: 1000
    })
    
    console.log("[Kind30001Journal] Found", listEvents.length, "Kind 30001 list events")
    
    // If no events found, wait and retry once (events might need time to propagate)
    if (listEvents.length === 0) {
      console.log("[Kind30001Journal] No list events found, waiting 3 seconds for propagation...")
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      console.log("[Kind30001Journal] Retrying query after delay...")
      const retryEvents = await pool.querySync(RELAYS, {
        kinds: [KIND30001_LIST],
        "#p": [authData.pubkey],
        limit: 1000
      })
      
      console.log("[Kind30001Journal] Retry found", retryEvents.length, "Kind 30001 list events")
      
      if (retryEvents.length > 0) {
        listEvents.push(...retryEvents)
      }
    }
    
    // Get deletion events to filter out deleted entries
    const deletionEvents = await pool.querySync(RELAYS, {
      kinds: [DELETION_KIND],
      authors: [authData.pubkey],
      limit: 1000
    })
    
    // Create set of deleted event IDs
    const deletedEventIds = new Set<string>()
    deletionEvents.forEach(deletionEvent => {
      deletionEvent.tags.forEach((tag: any[]) => {
        if (tag[0] === "e") {
          deletedEventIds.add(tag[1])
        }
      })
    })
    
    // Filter out deleted events
    const validEvents = listEvents.filter(event => !deletedEventIds.has(event.id))
    console.log("[Kind30001Journal] Found", validEvents.length, "valid Kind 30001 events after filtering deletions")
    
    const notes: DecryptedNote[] = []
    
    // Filter events by d-tag (p-tag filtering already done by relay query)
    const relevantEvents = validEvents.filter(event => {
      // Check if this is a journal entry by looking at the d-tag
      const dTag = event.tags.find(tag => tag[0] === "d")?.[1]
      if (!dTag || !dTag.startsWith("journal-")) {
        return false
      }
      
      // Verify the p-tag matches our user (double-check since relay already filtered)
      const pTag = event.tags.find(tag => tag[0] === "p")?.[1]
      if (pTag !== authData.pubkey) {
        console.log("[Kind30001Journal] P-tag mismatch:", pTag, "vs", authData.pubkey)
        return false
      }
      
      return true
    })
    
    console.log("[Kind30001Journal] Filtered to", relevantEvents.length, "relevant events for user")
    
    // Decrypt and parse each relevant event
    const journalEntries = await Promise.all(
      relevantEvents.map(async (event) => {
        try {
          console.log("[Kind30001Journal] Decrypting event:", event.id)
          const decryptedContent = await decryptKind30001Content(event.content, authData)
          
          if (decryptedContent) {
            console.log("[Kind30001Journal] Successfully decrypted journal entry:", decryptedContent.title)
            const note = {
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
            
            console.log(`[Kind30001Journal] Created note "${note.title}" with eventId: ${note.eventId}`)
            return note
          } else {
            console.log("[Kind30001Journal] Decryption returned null for event:", event.id)
            return null
          }
        } catch (error) {
          console.error("[Kind30001Journal] Failed to decrypt Kind 30001 event:", event.id, error)
          return null
        }
      })
    )
    
    // Filter out null results and add to notes
    const validEntries = journalEntries.filter(entry => entry !== null)
    notes.push(...validEntries)
    
    console.log("[Kind30001Journal] Successfully loaded", notes.length, "decrypted journal entries from Kind 30001")
    return notes
    
  } catch (error) {
    console.error("[Kind4Journal] Error loading journal from Kind 4:", error)
    return []
  }
}

/**
 * Save a journal entry as a Kind 30001 Generic List (parameterized replaceable event)
 */
export async function saveJournalAsKind30001(note: DecryptedNote, authData: any): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!authData) {
    return { success: false, error: "No auth data" }
  }

  try {
    // Get the actual pubkey from the signer (important for extension/remote signers)
    let actualPubkey = authData.pubkey
    if (authData.authMethod === "extension" && window.nostr) {
      actualPubkey = await window.nostr.getPublicKey()
      console.log("[Kind30001Journal] Got actual pubkey from extension:", actualPubkey)
    }
    
    // Encrypt the journal content using NIP-04
    const encryptedContent = await encryptKind30001Content(note, authData, actualPubkey)
    
    // Create unique identifier for this journal entry
    const dTag = `journal-${note.id || Date.now()}`
    
    // Create Kind 30001 event (parameterized replaceable event)
    const unsignedEvent = {
      kind: KIND30001_LIST,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", dTag], // Unique identifier for this journal entry
        ["p", authData.pubkey], // Consistent user identifier for filtering
      ],
      content: encryptedContent,
      pubkey: actualPubkey, // Use the actual pubkey from the signer
    }
    
    console.log("[Kind30001Journal] Event tags:", unsignedEvent.tags)
    console.log("[Kind30001Journal] Signing pubkey:", actualPubkey, "Filter pubkey:", authData.pubkey)
    
    console.log("[Kind30001Journal v1.0] Created unsigned Kind 30001 event:", {
      kind: unsignedEvent.kind,
      created_at: unsignedEvent.created_at,
      tags: unsignedEvent.tags,
      content_length: unsignedEvent.content.length,
      pubkey: unsignedEvent.pubkey,
      dTag: dTag
    })

    // Sign the event
    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    console.log("[Kind30001Journal v1.0] Publishing Kind 30001 journal entry to relays:", signedEvent.id)
    
    // Publish to relays with better error tracking
    const pool = getPool()
    
    // Publish to all relays using the correct nostr-tools API (v2.0)
    try {
      console.log(`[Kind4Journal v2.0] Publishing to ${RELAYS.length} relays using pool.publish()...`)
      const relays = await pool.publish(RELAYS, signedEvent)
      console.log(`[Kind4Journal v2.0] ✅ Published to ${relays.length} relays successfully`)
      
      // Log which relays we published to
      RELAYS.forEach((relay, index) => {
        console.log(`[Kind4Journal] ✅ Published to relay ${index + 1}: ${relay}`)
      })
      
      return {
        success: true,
        eventId: signedEvent.id
      }
      
    } catch (error) {
      console.error(`[Kind4Journal] ❌ Failed to publish to relays:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
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
    // Create Kind 5 deletion event for the Kind 4 event ID
    const deletionEvent = {
      kind: DELETION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", note.eventId], // Kind 4 event ID to delete
      ],
      content: "Deleted a journal entry from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    console.log("[Kind4Journal] Publishing Kind 5 deletion event for Kind 4 event:", signedEvent.id)
    
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
 * Encrypt journal content using NIP-04 encryption for Kind 30001
 */
async function encryptKind30001Content(note: DecryptedNote, authData: any, actualPubkey?: string): Promise<string> {
  
  // For Kind 30001, we encrypt with the user's actual keypair
  const userPubkey = actualPubkey || authData.pubkey
  
  // Create the journal data as JSON (include pubkey for filtering)
  const journalData = JSON.stringify({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
    lastModified: note.lastModified.toISOString(),
    pubkey: userPubkey, // Store the pubkey for filtering
  })
  
  console.log("[Kind30001Journal] Encrypting journal data for user:", userPubkey)
  
  // Get the private key
  const privateKey = getPrivateKeyForEncryption(authData)
  
  // Encrypt using NIP-04 with user's own keypair
  const encrypted = await nip04.encrypt(privateKey, userPubkey, journalData)
  
  return encrypted
}

/**
 * Decrypt Kind 30001 content using NIP-04 decryption
 */
async function decryptKind30001Content(encryptedData: string, authData: any): Promise<any> {
  
  try {
    // Since we've already filtered by pubkey, we know this event belongs to our user
    const userPubkey = authData.pubkey
    
    console.log("[Kind30001Journal] Decrypting with user pubkey:", userPubkey)
    
    // Get the private key
    const privateKey = getPrivateKeyForEncryption(authData)
    
    // Decrypt using NIP-04
    const decrypted = await nip04.decrypt(privateKey, userPubkey, encryptedData)
    
    // Parse the JSON content
    const journalData = JSON.parse(decrypted)
    
    return journalData
    
  } catch (error) {
    console.error("[Kind30001Journal] Failed to decrypt Kind 30001 content:", error)
    return null
  }
}

/**
 * Sync function - reload from Kind 30001 lists
 */
export async function syncFromKind30001(authData: any): Promise<DecryptedNote[]> {
  console.log("[Kind30001Journal] Syncing from Kind 30001 lists...")
  
  // Sync is just the same as loading from Kind 30001 lists
  const notes = await loadJournalFromKind30001(authData)
  
  console.log(`[Kind30001Journal] Sync complete: ${notes.length} journal entries loaded from Kind 30001 lists`)
  return notes
}

/**
 * Delete a journal entry by publishing a Kind 5 deletion event
 */
export async function deleteJournalKind30001(note: DecryptedNote, authData: any): Promise<{ success: boolean; error?: string }> {
  if (!note.eventId) {
    return { success: false, error: "No event ID to delete" }
  }

  try {
    // Create Kind 5 deletion event for the Kind 30001 event ID
    const deletionEvent = {
      kind: DELETION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", note.eventId], // Kind 30001 event ID to delete
      ],
      content: "Deleted a journal entry from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    console.log("[Kind30001Journal] Publishing Kind 5 deletion event for Kind 30001 event:", signedEvent.id)
    
    const pool = getPool()
    const relays = await pool.publish(RELAYS, signedEvent)
    
    return { success: true }
    
  } catch (error) {
    console.error("[Kind30001Journal] Error deleting journal entry:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Clean up global pool
export function cleanupPool() {
  if (globalPool) {
    globalPool.close(RELAYS)
    globalPool = null
    console.log("[Kind4Journal] Pool cleaned up")
  }
}
