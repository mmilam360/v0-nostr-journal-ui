// Nostr cryptography utilities for encrypted note storage
// Using simplified encryption for demo - in production use proper NIP-44 implementation

export interface EncryptedNote {
  id: string
  encryptedData: string
  iv: string
  createdAt: string
  updatedAt: string
}

export interface DecryptedNote {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date
  lastModified?: Date
  lastSynced?: Date
  syncStatus?: "local" | "syncing" | "synced" | "error"
  syncError?: string
  eventId?: string // Added to track the Nostr event ID for NIP-09 deletion
}

// Generate a deterministic key from user's pubkey for local encryption
function generateStorageKey(pubkey: string): string {
  return `nostr_journal_${pubkey.slice(0, 16)}`
}

async function encryptData(data: string, pubkey: string): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder()

  // Derive encryption key from pubkey
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pubkey.slice(0, 32).padEnd(32, "0")),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("nostr-journal-salt"),
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

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  }
}

async function decryptData(encryptedData: string, iv: string, pubkey: string): Promise<string> {
  try {
    console.log("[DecryptData] Starting decryption process")
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    console.log("[DecryptData] Deriving encryption key from pubkey")
    // Derive the same encryption key from pubkey
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pubkey.slice(0, 32).padEnd(32, "0")),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    )

    console.log("[DecryptData] Creating derived key")
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("nostr-journal-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    )

    console.log("[DecryptData] Converting encrypted data and IV")
    const encrypted = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
    const ivArray = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))

    console.log("[DecryptData] Performing actual decryption")
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArray }, key, encrypted)

    console.log("[DecryptData] Decryption successful")
    return decoder.decode(decrypted)
  } catch (error) {
    console.error("[DecryptData] Error during decryption:", error)
    throw error
  }
}

// Debounced encryption to reduce localStorage operations
let encryptionTimer: NodeJS.Timeout | null = null
let pendingNotes: DecryptedNote[] | null = null
let pendingPubkey: string | null = null

export async function saveEncryptedNotes(pubkey: string, notes: DecryptedNote[]): Promise<void> {
  // LOCAL STORAGE DISABLED - Only use remote data
  console.log('[Crypto] ⚠️ Local storage disabled - notes not saved locally')
  console.log('[Crypto] 📊 Notes count:', notes.length)
  console.log('[Crypto] 💾 Data will only be stored on Nostr relays')
  
  // Clear any pending operations
  if (encryptionTimer) {
    clearTimeout(encryptionTimer)
    encryptionTimer = null
  }
  pendingNotes = null
  pendingPubkey = null
}

// Immediate encryption (used by debounced function)
async function saveEncryptedNotesInternal(pubkey: string, notes: DecryptedNote[]): Promise<void> {
  try {
    const storageKey = generateStorageKey(pubkey)
    console.log("[v0] Saving notes with storage key:", storageKey)
    console.log("[v0] Saving notes count:", notes.length)
    console.log("[v0] Saving note IDs:", notes.map(n => n.id))
    
    const notesData = JSON.stringify(notes)

    const { encrypted, iv } = await encryptData(notesData, pubkey)

    const encryptedStorage = {
      data: encrypted,
      iv,
      timestamp: Date.now(),
      version: "1.0", // Added version for future compatibility
    }

    localStorage.setItem(storageKey, JSON.stringify(encryptedStorage))
    console.log("[v0] ✅ Successfully saved to localStorage at:", new Date().toLocaleString())
  } catch (error) {
    console.error("[v0] Error saving encrypted notes:", error)
    throw error
  }
}

// Force immediate save (for critical operations like logout)
export async function saveEncryptedNotesImmediate(pubkey: string, notes: DecryptedNote[]): Promise<void> {
  // LOCAL STORAGE DISABLED - Only use remote data
  console.log('[Crypto] ⚠️ Local storage disabled - not saving notes to localStorage')
  console.log('[Crypto] 🌐 Notes will be saved to Nostr relays only')
}

export async function loadEncryptedNotes(pubkey: string): Promise<DecryptedNote[]> {
  // LOCAL STORAGE DISABLED - Only use remote data
  console.log('[Crypto] ⚠️ Local storage disabled - not loading notes from localStorage')
  console.log('[Crypto] 🌐 Notes will be loaded from Nostr relays only')
  return []
}

export function clearEncryptedNotes(pubkey: string): void {
  // LOCAL STORAGE DISABLED - No local storage to clear
  console.log("[Crypto] ⚠️ Local storage disabled - no local notes to clear")
}

// Utility to get short pubkey for display
export function getShortPubkey(pubkey: string): string {
  if (pubkey.startsWith("npub")) {
    return pubkey.slice(0, 12) + "..."
  }
  return pubkey.length > 20 ? `${pubkey.slice(0, 20)}...` : pubkey
}

// Generate a storage key for encrypted private keys
function generatePrivateKeyStorageKey(pubkey: string): string {
  return `nostr_journal_pk_${pubkey.slice(0, 16)}`
}

// Encrypt a private key with a password
export async function encryptPrivateKey(privateKeyHex: string, password: string, pubkey: string): Promise<void> {
  try {
    const encoder = new TextEncoder()

    // Derive encryption key from password using PBKDF2
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, [
      "deriveKey",
    ])

    // Use pubkey as salt for deterministic key derivation
    const salt = encoder.encode(pubkey.slice(0, 32))

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(privateKeyHex))

    const encryptedStorage = {
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      timestamp: Date.now(),
      version: "1.0",
    }

    const storageKey = generatePrivateKeyStorageKey(pubkey)
    localStorage.setItem(storageKey, JSON.stringify(encryptedStorage))
    console.log("[v0] Private key encrypted and saved to localStorage")
  } catch (error) {
    console.error("[v0] Error encrypting private key:", error)
    throw error
  }
}

// Decrypt a private key with a password
export async function decryptPrivateKey(password: string, pubkey: string): Promise<string> {
  try {
    const storageKey = generatePrivateKeyStorageKey(pubkey)
    const stored = localStorage.getItem(storageKey)

    if (!stored) {
      throw new Error("No encrypted private key found")
    }

    const encryptedStorage = JSON.parse(stored)
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    // Derive the same encryption key from password
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, [
      "deriveKey",
    ])

    const salt = encoder.encode(pubkey.slice(0, 32))

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    )

    const encrypted = Uint8Array.from(atob(encryptedStorage.data), (c) => c.charCodeAt(0))
    const ivArray = Uint8Array.from(atob(encryptedStorage.iv), (c) => c.charCodeAt(0))

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArray }, key, encrypted)

    const privateKeyHex = decoder.decode(decrypted)
    console.log("[v0] Private key decrypted successfully")
    return privateKeyHex
  } catch (error) {
    console.error("[v0] Error decrypting private key:", error)
    throw new Error("Failed to decrypt private key. Wrong password?")
  }
}

// Check if a private key is stored for a given pubkey
export function hasStoredPrivateKey(pubkey: string): boolean {
  const storageKey = generatePrivateKeyStorageKey(pubkey)
  return localStorage.getItem(storageKey) !== null
}

// Clear stored private key
export function clearStoredPrivateKey(pubkey: string): void {
  const storageKey = generatePrivateKeyStorageKey(pubkey)
  localStorage.removeItem(storageKey)
  console.log("[v0] Encrypted private key cleared from localStorage")
}
