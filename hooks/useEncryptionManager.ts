"use client"
import { useState, useEffect, useCallback } from "react"
import * as nostrTools from "nostr-tools"

// Define a unique identifier for your app's events
const SALT_EVENT_D_TAG = "nostrjournal_salt_v1"

interface UseEncryptionManagerProps {
  userPubkey: string
  nostrSigner: any // The user's private key for signing events
}

export const useEncryptionManager = ({ userPubkey, nostrSigner }: UseEncryptionManagerProps) => {
  // New, more detailed states for the entire lifecycle
  const [status, setStatus] = useState<"checking_nostr" | "needs_creation" | "needs_unlock" | "unlocked" | "error">(
    "checking_nostr",
  )
  const [errorMessage, setErrorMessage] = useState("")
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)

  const checkSaltOnNostr = useCallback(async () => {
    // This is the "amnesia fix". We check if the user exists.
    setStatus("checking_nostr")
    try {
      console.log("[v0] Checking for existing salt event on Nostr...")

      // Use SimplePool for modern nostr-tools
      const pool = new nostrTools.SimplePool()
      const relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

      const saltEvent = await pool.get(relays, {
        kinds: [30078],
        authors: [userPubkey],
        "#d": [SALT_EVENT_D_TAG],
        limit: 1,
      })

      pool.close(relays)

      if (saltEvent) {
        console.log("[v0] Found existing salt event - user is returning")
        setStatus("needs_unlock") // User exists! Ask them to unlock.
      } else {
        console.log("[v0] No salt event found - user is new")
        setStatus("needs_creation") // User is new! Ask them to create a password.
      }
    } catch (e) {
      console.error("[v0] Error checking salt on Nostr:", e)
      setStatus("error")
      setErrorMessage("Could not connect to Nostr relays to check account status.")
    }
  }, [userPubkey])

  useEffect(() => {
    if (userPubkey && nostrSigner) {
      checkSaltOnNostr()
    }
  }, [userPubkey, nostrSigner, checkSaltOnNostr])

  const createAndSaveSalt = async (masterPassword: string) => {
    try {
      console.log("[v0] Creating and saving salt...")
      setStatus("checking_nostr") // Show loading while processing

      // Generate a random salt using crypto.getRandomValues
      const saltArray = new Uint8Array(16)
      crypto.getRandomValues(saltArray)
      const salt = Array.from(saltArray, (byte) => byte.toString(16).padStart(2, "0")).join("")

      // Derive key using Web Crypto API (PBKDF2)
      const encoder = new TextEncoder()
      const passwordBuffer = encoder.encode(masterPassword)
      const saltBuffer = encoder.encode(salt)

      const keyMaterial = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, [
        "deriveBits",
      ])

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        256,
      )

      const key = Array.from(new Uint8Array(derivedBits), (byte) => byte.toString(16).padStart(2, "0")).join("")

      // Now save the SALT to Nostr so we can find it next time.
      const event = nostrTools.finalizeEvent(
        {
          kind: 30078,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", SALT_EVENT_D_TAG]],
          content: JSON.stringify({ salt: salt }),
        },
        nostrSigner,
      )

      const pool = new nostrTools.SimplePool()
      const relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

      await Promise.all(pool.publish(relays, event))
      pool.close(relays)

      console.log("[v0] Salt saved to Nostr successfully")
      setEncryptionKey(key)
      setStatus("unlocked")
    } catch (e) {
      console.error("[v0] Error creating and saving salt:", e)
      setStatus("error")
      setErrorMessage("Failed to save account setup to Nostr.")
    }
  }

  const unlockWithPassword = async (masterPassword: string) => {
    try {
      console.log("[v0] Unlocking with password...")
      setStatus("checking_nostr") // Show loading while processing

      // Fetch the salt from Nostr
      const pool = new nostrTools.SimplePool()
      const relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

      const saltEvent = await pool.get(relays, {
        kinds: [30078],
        authors: [userPubkey],
        "#d": [SALT_EVENT_D_TAG],
        limit: 1,
      })

      pool.close(relays)

      if (!saltEvent) {
        throw new Error("Salt event not found")
      }

      const { salt } = JSON.parse(saltEvent.content)

      // Derive the same key using the stored salt
      const encoder = new TextEncoder()
      const passwordBuffer = encoder.encode(masterPassword)
      const saltBuffer = encoder.encode(salt)

      const keyMaterial = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, [
        "deriveBits",
      ])

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        256,
      )

      const key = Array.from(new Uint8Array(derivedBits), (byte) => byte.toString(16).padStart(2, "0")).join("")

      console.log("[v0] Password verified successfully")
      setEncryptionKey(key)
      setStatus("unlocked")
    } catch (e) {
      console.error("[v0] Error unlocking with password:", e)
      setStatus("error")
      setErrorMessage("Incorrect password or failed to retrieve account data.")
    }
  }

  return { status, errorMessage, createAndSaveSalt, unlockWithPassword, encryptionKey }
}
