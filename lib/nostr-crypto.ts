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
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Derive the same encryption key from pubkey
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
    ["decrypt"],
  )

  const encrypted = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))
  const ivArray = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArray }, key, encrypted)

  return decoder.decode(decrypted)
}

export async function saveEncryptedNotes(pubkey: string, notes: DecryptedNote[]): Promise<void> {
  try {
    const storageKey = generateStorageKey(pubkey)
    const notesData = JSON.stringify(notes)

    const { encrypted, iv } = await encryptData(notesData, pubkey)

    const encryptedStorage = {
      data: encrypted,
      iv,
      timestamp: Date.now(),
      version: "1.0", // Added version for future compatibility
    }

    localStorage.setItem(storageKey, JSON.stringify(encryptedStorage))
    console.log("[v0] Notes encrypted and saved to localStorage")
  } catch (error) {
    console.error("[v0] Error saving encrypted notes:", error)
    throw error
  }
}

export async function loadEncryptedNotes(pubkey: string): Promise<DecryptedNote[]> {
  try {
    const storageKey = generateStorageKey(pubkey)
    const stored = localStorage.getItem(storageKey)

    if (!stored) {
      console.log("[v0] No stored notes found for user")
      return []
    }

    const encryptedStorage = JSON.parse(stored)
    const decryptedData = await decryptData(encryptedStorage.data, encryptedStorage.iv, pubkey)
    const notes = JSON.parse(decryptedData)

    // Convert date strings back to Date objects
    const processedNotes = notes.map((note: any) => ({
      ...note,
      createdAt: new Date(note.createdAt),
    }))

    console.log("[v0] Notes decrypted and loaded from localStorage:", processedNotes.length)
    return processedNotes
  } catch (error) {
    console.error("[v0] Error loading encrypted notes:", error)
    return []
  }
}

export function clearEncryptedNotes(pubkey: string): void {
  const storageKey = generateStorageKey(pubkey)
  localStorage.removeItem(storageKey)
  console.log("[v0] Encrypted notes cleared from localStorage")
}

// Utility to get short pubkey for display
export function getShortPubkey(pubkey: string): string {
  if (pubkey.startsWith("npub")) {
    return pubkey.slice(0, 12) + "..."
  }
  return pubkey.length > 20 ? `${pubkey.slice(0, 20)}...` : pubkey
}
