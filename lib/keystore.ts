// IndexedDB-based secure keystore for Nostr private keys
// Based on Shakespeare/Soapbox architecture

interface StoredAccount {
  encryptedNsec: string
  salt: string
  iv: string
  pubkey: string
}

class LocalKeystore {
  private dbName = "nostr-journal-keystore"
  private version = 1
  private storeName = "accounts"

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" })
        }
      }
    })
  }

  async hasAccount(): Promise<boolean> {
    try {
      const db = await this.openDB()
      const transaction = db.transaction([this.storeName], "readonly")
      const store = transaction.objectStore(this.storeName)
      const request = store.get("primary")

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(!!request.result)
        request.onerror = () => resolve(false)
      })
    } catch {
      return false
    }
  }

  async saveAccount(nsecBytes: Uint8Array, password: string): Promise<void> {
    const { nip19, getPublicKey } = await import("nostr-tools")

    // Generate salt and IV for encryption
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Derive key from password
    const encoder = new TextEncoder()
    const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
      "deriveKey",
    ])

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )

    // Encrypt the nsec
    const nsecHex = Array.from(nsecBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    const encryptedData = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, derivedKey, encoder.encode(nsecHex))

    // Get pubkey for verification
    const pubkey = getPublicKey(nsecBytes)

    const account: StoredAccount = {
      encryptedNsec: Array.from(new Uint8Array(encryptedData), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      salt: Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      iv: Array.from(iv, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      pubkey: pubkey,
    }

    const db = await this.openDB()
    const transaction = db.transaction([this.storeName], "readwrite")
    const store = transaction.objectStore(this.storeName)

    return new Promise((resolve, reject) => {
      const request = store.put({ id: "primary", ...account })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async loadAccount(password: string): Promise<Uint8Array> {
    const db = await this.openDB()
    const transaction = db.transaction([this.storeName], "readonly")
    const store = transaction.objectStore(this.storeName)
    const request = store.get("primary")

    const account: StoredAccount = await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result)
        } else {
          reject(new Error("No account found"))
        }
      }
      request.onerror = () => reject(request.error)
    })

    // Reconstruct salt and IV
    const salt = new Uint8Array(account.salt.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    const iv = new Uint8Array(account.iv.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    const encryptedData = new Uint8Array(
      account.encryptedNsec.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
    )

    // Derive key from password
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
      "deriveKey",
    ])

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )

    try {
      // Decrypt the nsec
      const decryptedData = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, derivedKey, encryptedData)

      const nsecHex = decoder.decode(decryptedData)
      return new Uint8Array(nsecHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
    } catch {
      throw new Error("Incorrect password or corrupted data")
    }
  }

  async deleteAccount(): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction([this.storeName], "readwrite")
    const store = transaction.objectStore(this.storeName)

    return new Promise((resolve, reject) => {
      const request = store.delete("primary")
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getStoredPubkey(): Promise<string | null> {
    try {
      const db = await this.openDB()
      const transaction = db.transaction([this.storeName], "readonly")
      const store = transaction.objectStore(this.storeName)
      const request = store.get("primary")

      return new Promise((resolve) => {
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.pubkey)
          } else {
            resolve(null)
          }
        }
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }
}

export const localKeystore = new LocalKeystore()
