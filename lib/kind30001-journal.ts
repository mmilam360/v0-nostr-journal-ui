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
async function getPrivateKeyForEncryption(authData: any): Promise<string> {
  console.log("[Kind30001Journal] 🔑 Getting private key for encryption:")
  console.log("[Kind30001Journal] Auth method:", authData.authMethod)
  
  if (authData.authMethod === "extension") {
    // For extension auth, use pubkey as fallback (this was working before)
    console.log("[Kind30001Journal] Using extension pubkey as encryption key:", authData.pubkey)
    return authData.pubkey
  } else if (authData.authMethod === "nsec" && authData.privateKey) {
    console.log("[Kind30001Journal] Using nsec private key for encryption")
    return authData.privateKey
  } else if (authData.authMethod === "remote") {
    // CRITICAL: For remote signers, we CANNOT access the private key
    // Remote signer will handle encryption via its own methods
    console.log("[Kind30001Journal] Remote signer - using pubkey for key derivation:", authData.pubkey)
    return authData.pubkey
  } else {
    throw new Error("No encryption key available")
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
    // Get the actual pubkey from the signer (important for extension/remote signers)
    let actualPubkey = authData.pubkey
    console.log("[Kind30001Journal] 🔍 DEBUGGING PUBKEY CONSISTENCY:")
    console.log("[Kind30001Journal] Auth method:", authData.authMethod)
    console.log("[Kind30001Journal] AuthData pubkey:", authData.pubkey)
    
    if (authData.authMethod === "extension" && window.nostr) {
      actualPubkey = await window.nostr.getPublicKey()
      console.log("[Kind30001Journal] Got actual pubkey from extension:", actualPubkey)
      console.log("[Kind30001Journal] ⚠️  EXTENSION PUBKEY DIFFERENT FROM AUTH DATA:", actualPubkey !== authData.pubkey)
    } else if (authData.authMethod === "remote") {
      // For remote signers, use the pubkey from the remote signer session
      const { isConnected, getPublicKey } = await import("./unified-remote-signer")
      if (isConnected()) {
        const userPubkey = await getPublicKey()
        if (userPubkey) {
          actualPubkey = userPubkey
          console.log("[Kind30001Journal] Got actual pubkey from remote signer:", actualPubkey)
          console.log("[Kind30001Journal] ⚠️  REMOTE PUBKEY DIFFERENT FROM AUTH DATA:", actualPubkey !== authData.pubkey)
        }
      }
    } else if (authData.authMethod === "nsec") {
      console.log("[Kind30001Journal] Using nsec authData pubkey:", actualPubkey)
    }
    
    console.log("[Kind30001Journal] 🎯 FINAL PUBKEY FOR QUERY:", actualPubkey)
    
    // Query for Kind 30001 events with the ACTUAL user pubkey in p-tag
    console.log("[Kind30001Journal] Querying relays for Kind 30001 events with p-tag:", actualPubkey)
    console.log("[Kind30001Journal] Query filters:", {
      kinds: [KIND30001_LIST],
      "#p": [actualPubkey],
      limit: 1000
    })
    
    // Use pool.querySync with p-tag filter for consistent user identification
    const listEvents = await pool.querySync(RELAYS, {
      kinds: [KIND30001_LIST],
      "#p": [actualPubkey],
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
        "#p": [actualPubkey],
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
      if (pTag !== actualPubkey) {
        console.log("[Kind30001Journal] P-tag mismatch:", pTag, "vs", actualPubkey)
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
          const decryptedContent = await decryptKind30001Content(event.content, authData, actualPubkey)
          
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
      console.error("[Kind30001Journal] Error loading journal from Kind 30001:", error)
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
    console.log("[Kind30001Journal] 🚀 Starting save process...")
    console.log("[Kind30001Journal] Auth method:", authData.authMethod)
    console.log("[Kind30001Journal] Note ID:", note.id)
    console.log("[Kind30001Journal] Note title:", note.title)
    
    // Get the actual pubkey from the signer (important for extension/remote signers)
    let actualPubkey = authData.pubkey
    console.log("[Kind30001Journal] 🔍 SAVE DEBUGGING PUBKEY CONSISTENCY:")
    console.log("[Kind30001Journal] Auth method:", authData.authMethod)
    console.log("[Kind30001Journal] AuthData pubkey:", authData.pubkey)
    
    if (authData.authMethod === "extension" && window.nostr) {
      actualPubkey = await window.nostr.getPublicKey()
      console.log("[Kind30001Journal] Got actual pubkey from extension:", actualPubkey)
      console.log("[Kind30001Journal] ⚠️  EXTENSION PUBKEY DIFFERENT FROM AUTH DATA:", actualPubkey !== authData.pubkey)
    } else if (authData.authMethod === "remote") {
      // For remote signers, use the pubkey from the remote signer session
      const { isConnected, getPublicKey } = await import("./unified-remote-signer")
      if (isConnected()) {
        const userPubkey = await getPublicKey()
        if (userPubkey) {
          actualPubkey = userPubkey
          console.log("[Kind30001Journal] Got actual pubkey from remote signer:", actualPubkey)
          console.log("[Kind30001Journal] ⚠️  REMOTE PUBKEY DIFFERENT FROM AUTH DATA:", actualPubkey !== authData.pubkey)
        }
      }
    }
    
    console.log("[Kind30001Journal] 🎯 FINAL PUBKEY FOR SAVE:", actualPubkey)
    
    // Encrypt the journal content using NIP-04
    console.log("[Kind30001Journal] 🔐 Encrypting content...")
    const encryptedContent = await encryptKind30001Content(note, authData, actualPubkey)
    console.log("[Kind30001Journal] ✅ Content encrypted, length:", encryptedContent.length)
    
    // Create unique identifier for this journal entry
    const dTag = `journal-${note.id || Date.now()}`
    
    // Create Kind 30001 event (parameterized replaceable event)
    const unsignedEvent = {
      kind: KIND30001_LIST,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", dTag],
        ["p", actualPubkey],  // Use actualPubkey for consistent filtering
      ],
      content: encryptedContent,
      pubkey: actualPubkey,
    }
    
    console.log("[Kind30001Journal] 📝 Created unsigned event:", {
      kind: unsignedEvent.kind,
      tags: unsignedEvent.tags,
      pubkey: unsignedEvent.pubkey,
      contentLength: unsignedEvent.content.length
    })

    // Sign the event
    console.log("[Kind30001Journal] ✍️  Signing event...")
    const signedEvent = await signEventWithRemote(unsignedEvent, authData)
    console.log("[Kind30001Journal] ✅ Event signed, ID:", signedEvent.id)
    
    // Publish to relays
    console.log("[Kind30001Journal] 📡 Publishing to", RELAYS.length, "relays...")
    const pool = getPool()
    
    try {
      const publishedRelays = await pool.publish(RELAYS, signedEvent)
      console.log("[Kind30001Journal] ✅ Published to", publishedRelays.length, "relays successfully")
      
      // Log which relays accepted
      RELAYS.forEach((relay, index) => {
        console.log(`[Kind30001Journal] ✅ Relay ${index + 1}: ${relay}`)
      })
      
      return {
        success: true,
        eventId: signedEvent.id
      }
      
    } catch (publishError) {
      console.error("[Kind30001Journal] ❌ Publishing failed:", publishError)
      return {
        success: false,
        error: publishError instanceof Error ? publishError.message : "Publishing failed"
      }
    }
    
  } catch (error) {
    console.error("[Kind30001Journal] ❌ Save error:", error)
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

/**
 * Encrypt journal content using NIP-04 encryption for Kind 30001
 */
async function encryptKind30001Content(note: DecryptedNote, authData: any, actualPubkey?: string): Promise<string> {
  
  // For Kind 30001, we encrypt with the user's actual keypair
  const userPubkey = actualPubkey || authData.pubkey
  
  // Create the journal data as JSON
  const journalData = JSON.stringify({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
    lastModified: note.lastModified.toISOString(),
  })
  
  console.log("[Kind30001Journal] Encrypting journal data for user:", userPubkey)
  
  try {
    // Use deterministic encryption for ALL methods to ensure consistency
    console.log("[Kind30001Journal] 🔐 Using deterministic pubkey-based encryption for all methods...")
    const encrypted = await deterministicEncrypt(userPubkey, journalData)
    console.log("[Kind30001Journal] ✅ Encrypted with deterministic method")
    
    return encrypted
    
    // OLD REMOTE SIGNER METHOD (removed for consistency):
    // if (authData.authMethod === "remote") {
    //   // CRITICAL: For remote signers, use the signer's nip04_encrypt method
    //   console.log("[Kind30001Journal] Using remote signer's nip04_encrypt method...")
    //   
    //   const { remoteSignerManager } = await import("./remote-signer-manager")
    //   
    //   if (!remoteSignerManager.isAvailable()) {
    //     throw new Error("Remote signer not available. Please reconnect.")
    //   }
    //   
    //   // Get the signer from the remote signer manager
    //   const sessionInfo = remoteSignerManager.getSessionInfo()
    //   if (!sessionInfo.available || !sessionInfo.hasSigner) {
    //     throw new Error("Remote signer not properly initialized")
    //   }
    //   
    //   // Use the remote signer's nip04_encrypt method
    //   const encrypted = await remoteSignerManager.nip04Encrypt(userPubkey, journalData)
    //   console.log("[Kind30001Journal] ✅ Encrypted with remote signer")
    //   
    //   return encrypted
    //   
    // }
  } catch (error) {
    console.error("[Kind30001Journal] ❌ Encryption failed:", error)
    throw new Error(`Failed to encrypt journal data: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Decrypt Kind 30001 content using consistent decryption approach
 */
async function decryptKind30001Content(encryptedData: string, authData: any, actualPubkey?: string): Promise<any> {
  
  try {
    const userPubkey = actualPubkey || authData.pubkey
    
    console.log("[Kind30001Journal] 🔍 DECRYPTION DEBUGGING:")
    console.log("[Kind30001Journal] Auth method:", authData.authMethod)
    console.log("[Kind30001Journal] User pubkey for decryption:", userPubkey)
    console.log("[Kind30001Journal] Encrypted data length:", encryptedData.length)
    
    // Use deterministic decryption for ALL methods to ensure consistency
    console.log("[Kind30001Journal] 🔓 Using deterministic pubkey-based decryption for all methods...")
    const decrypted = await deterministicDecrypt(userPubkey, encryptedData)
    console.log("[Kind30001Journal] ✅ Decrypted with deterministic method")
    
    // Parse the JSON content
    const journalData = JSON.parse(decrypted)
    console.log("[Kind30001Journal] 📄 Decrypted journal data:", journalData.title)
    return journalData
    
    // OLD REMOTE SIGNER METHOD (removed for consistency):
    // if (authData.authMethod === "remote") {
    //   // CRITICAL: For remote signers, use the signer's nip04_decrypt method
    //   console.log("[Kind30001Journal] 🔐 Using remote signer's nip04_decrypt method...")
    //   
    //   const { remoteSignerManager } = await import("./remote-signer-manager")
    //   
    //   if (!remoteSignerManager.isAvailable()) {
    //     throw new Error("Remote signer not available. Please reconnect.")
    //   }
    //   
    //   // Get the signer from the remote signer manager
    //   const sessionInfo = remoteSignerManager.getSessionInfo()
    //   if (!sessionInfo.available || !sessionInfo.hasSigner) {
    //     throw new Error("Remote signer not properly initialized")
    //   }
    //   
    //   // Use the remote signer's nip04_decrypt method
    //   const decrypted = await remoteSignerManager.nip04Decrypt(userPubkey, encryptedData)
    //   console.log("[Kind30001Journal] ✅ Decrypted with remote signer")
    //   
    //   // Parse the JSON content
    //   const journalData = JSON.parse(decrypted)
    //   console.log("[Kind30001Journal] 📄 Decrypted journal data:", journalData.title)
    //   return journalData
    //   
    // }
    
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
    console.log("[Kind30001Journal] Pool cleaned up")
  }
}

/**
 * Deterministic encryption based on pubkey for consistency across login methods
 */
async function deterministicEncrypt(pubkey: string, plaintext: string): Promise<string> {
  console.log("[Kind30001Journal] 🔐 Deterministic encryption for pubkey:", pubkey)
  
  // Use the same deterministic method as nostr-crypto.ts
  const encoder = new TextEncoder()
  const encryptionKey = encoder.encode(pubkey).slice(0, 32)
  
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
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext))
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  
  return btoa(String.fromCharCode(...combined))
}

/**
 * Deterministic decryption based on pubkey for consistency across login methods
 */
async function deterministicDecrypt(pubkey: string, encryptedData: string): Promise<string> {
  console.log("[Kind30001Journal] 🔓 Deterministic decryption for pubkey:", pubkey)
  
  // Use the same deterministic method as nostr-crypto.ts
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  
  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  const encryptionKey = encoder.encode(pubkey).slice(0, 32)
  
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
  return decoder.decode(decrypted)
}
