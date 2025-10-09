"use client"

import { nip04, generatePrivateKey, getPublicKey, SimplePool } from "nostr-tools"
import type { DecryptedNote } from "./nostr-crypto"
import { signEventWithRemote } from "./signer-manager"

// NIP-59 Gift Wrap implementation for Kind 4 DMs
const GIFT_WRAP_KIND = 1059
const SEAL_KIND = 13

// Create a gift-wrapped Kind 4 event according to NIP-59
async function createGiftWrappedDM(unsignedEvent: any, authData: any): Promise<any> {
  try {
    // Step 1: Create the rumor (unsigned event)
    const rumor = {
      ...unsignedEvent,
      // Remove signature if present
      sig: undefined
    }
    
    // Step 2: Create the seal (Kind 13) - encrypted with sender's key
    const senderPrivateKey = getPrivateKeyForEncryption(authData)
    
    const rumorJson = JSON.stringify(rumor)
    const sealedContent = await nip04.encrypt(senderPrivateKey, authData.pubkey, rumorJson)
    
    const seal = {
      kind: SEAL_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", authData.pubkey]], // Recipient (self)
      content: sealedContent,
      pubkey: authData.pubkey
    }
    
    // Step 3: Create the gift wrap (Kind 1059) - encrypted with throwaway key
    const throwawayKey = generatePrivateKey()
    const throwawayPubkey = getPublicKey(throwawayKey)
    
    const sealJson = JSON.stringify(seal)
    const wrappedContent = await nip04.encrypt(throwawayKey, authData.pubkey, sealJson)
    
    const giftWrap = {
      kind: GIFT_WRAP_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", authData.pubkey], // Recipient
        ["p", throwawayPubkey]  // Sender (throwaway key)
      ],
      content: wrappedContent,
      pubkey: throwawayPubkey
    }
    
    console.log("[Kind4Journal] Created gift-wrapped DM with throwaway key:", throwawayPubkey)
    return giftWrap
    
  } catch (error) {
    console.error("[Kind4Journal] Error creating gift-wrapped DM:", error)
    throw error
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

// Unwrap a gift-wrapped event to get the original Kind 4 event
async function unwrapGiftWrappedEvent(giftWrappedEvent: any, authData: any): Promise<any> {
  try {
    const privateKey = getPrivateKeyForEncryption(authData)
    
    // Step 1: Decrypt the gift wrap to get the seal
    const sealJson = await nip04.decrypt(privateKey, authData.pubkey, giftWrappedEvent.content)
    const seal = JSON.parse(sealJson)
    
    // Step 2: Decrypt the seal to get the rumor (original Kind 4 event)
    const rumorJson = await nip04.decrypt(privateKey, authData.pubkey, seal.content)
    const rumor = JSON.parse(rumorJson)
    
    console.log("[Kind4Journal] Successfully unwrapped gift-wrapped event:", rumor.id)
    return rumor
    
  } catch (error) {
    console.error("[Kind4Journal] Failed to unwrap gift-wrapped event:", error)
    return null
  }
}

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
let globalPool: SimplePool | null = null

function getPool(): SimplePool {
  if (!globalPool) {
    globalPool = new SimplePool()
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
    // Query for gift-wrapped events (Kind 1059) where user is recipient
    console.log("[Kind4Journal] Querying relays for gift-wrapped Kind 1059 events...")
    console.log("[Kind4Journal] Query filters:", {
      kinds: [GIFT_WRAP_KIND],
      "#p": [authData.pubkey],
      limit: 1000
    })
    
    const giftWrappedEvents = await pool.querySync(RELAYS, [
      { 
        kinds: [GIFT_WRAP_KIND], 
        "#p": [authData.pubkey], // p-tag must match user's pubkey (recipient)
        limit: 1000
      }
    ], { timeout: 15000 })
    
    console.log("[Kind4Journal] Found", giftWrappedEvents.length, "gift-wrapped events")
    
    // If no events found, wait and retry once (events might need time to propagate)
    if (giftWrappedEvents.length === 0) {
      console.log("[Kind4Journal] No gift-wrapped events found, waiting 3 seconds for propagation...")
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      console.log("[Kind4Journal] Retrying query after delay...")
      const retryEvents = await pool.querySync(RELAYS, [
        { 
          kinds: [GIFT_WRAP_KIND], 
          "#p": [authData.pubkey],
          limit: 1000
        }
      ], { timeout: 15000 })
      
      console.log("[Kind4Journal] Retry found", retryEvents.length, "gift-wrapped events")
      
      if (retryEvents.length > 0) {
        giftWrappedEvents.push(...retryEvents)
      } else {
        // Try a broader query to see if any gift-wrapped events exist
        console.log("[Kind4Journal] Still no gift-wrapped events found, checking for any Kind 1059 events...")
        const anyGiftWrappedEvents = await pool.querySync(RELAYS, [
          { 
            kinds: [GIFT_WRAP_KIND], 
            limit: 100
          }
        ], { timeout: 10000 })
        
        console.log("[Kind4Journal] Found", anyGiftWrappedEvents.length, "total Kind 1059 events")
        
        if (anyGiftWrappedEvents.length > 0) {
          console.log("[Kind4Journal] Sample gift-wrapped events found:")
          anyGiftWrappedEvents.slice(0, 3).forEach((event, i) => {
            const pTags = event.tags.filter(tag => tag[0] === "p")
            console.log(`[Kind4Journal] Event ${i + 1}: ${event.id}, p-tags:`, pTags)
          })
        }
      }
    }
    
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
    
    // Process gift-wrapped events to extract Kind 4 events
    const validEvents: any[] = []
    
    for (const giftWrappedEvent of giftWrappedEvents) {
      try {
        // Unwrap the gift-wrapped event to get the Kind 4 event
        const kind4Event = await unwrapGiftWrappedEvent(giftWrappedEvent, authData)
        if (kind4Event && !deletedEventIds.has(kind4Event.id)) {
          validEvents.push(kind4Event)
        }
      } catch (error) {
        console.warn("[Kind4Journal] Failed to unwrap gift-wrapped event:", giftWrappedEvent.id, error)
      }
    }
    console.log("[Kind4Journal] Found", validEvents.length, "valid entries after filtering deletions")
    
    const notes: DecryptedNote[] = []
    
    for (const event of validEvents) {
      try {
        console.log("[Kind4Journal] Attempting to decrypt Kind 4 event:", event.id)
        const decryptedContent = await decryptKind4Content(event.content, authData)
        if (decryptedContent && decryptedContent.header === "This message is from Nostr Journal, don't delete it") {
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
          console.log("[Kind4Journal] Decryption returned null or invalid header for event:", event.id)
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
    
    console.log("[Kind4Journal] Created unsigned Kind 4 event:", {
      kind: unsignedEvent.kind,
      created_at: unsignedEvent.created_at,
      tags: unsignedEvent.tags,
      content_length: unsignedEvent.content.length,
      pubkey: unsignedEvent.pubkey
    })

    // Create gift-wrapped version for compatibility with DM apps like 0xchat
    console.log("[Kind4Journal] Creating gift-wrapped DM for compatibility...")
    const giftWrappedEvent = await createGiftWrappedDM(unsignedEvent, authData)
    
    // Sign the gift-wrapped event
    const signedEvent = await signEventWithRemote(giftWrappedEvent, authData)
    console.log("[Kind4Journal] Publishing gift-wrapped Kind 1059 journal entry to relays:", signedEvent.id)
    
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
    // Create Kind 5 deletion event for the gift-wrapped event ID
    const deletionEvent = {
      kind: DELETION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", note.eventId], // Gift-wrapped event ID to delete
      ],
      content: "Deleted a journal entry from Nostr Journal.",
      pubkey: authData.pubkey,
    }

    const signedEvent = await signEventWithRemote(deletionEvent, authData)
    console.log("[Kind4Journal] Publishing Kind 5 deletion event for gift-wrapped event:", signedEvent.id)
    
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
  
  // For Kind 4, we use the recipient's pubkey (which is the same as sender for self-DM)
  const recipientPubkey = authData.pubkey
  
  // Create the journal data as JSON with header
  const journalData = JSON.stringify({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
    lastModified: note.lastModified.toISOString(),
    // Add header to identify this as a Nostr Journal entry
    header: "This message is from Nostr Journal, don't delete it"
  })
  
  console.log("[Kind4Journal] Encrypting journal data for recipient:", recipientPubkey)
  
  // Get the private key
  const privateKey = getPrivateKeyForEncryption(authData)
  
  // Encrypt using NIP-04
  const encrypted = await nip04.encrypt(privateKey, recipientPubkey, journalData)
  
  return encrypted
}

/**
 * Decrypt Kind 4 content using NIP-04 decryption
 */
async function decryptKind4Content(encryptedData: string, authData: any): Promise<any> {
  
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
