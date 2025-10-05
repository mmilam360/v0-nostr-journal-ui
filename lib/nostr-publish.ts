"use client"

import * as nostrTools from "nostr-tools"
import { getSmartRelayList, getRelays } from "./relay-manager"
import { signEventWithRemote } from "./signer-manager"

export const createNostrEvent = async (pubkey: string, content: string, tags: string[] = []) => {
  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags.map((tag) => ["t", tag]),
    content: content,
    pubkey: pubkey,
  }
  return event
}

export const publishToNostr = async (unsignedEvent: any, authData: any): Promise<string> => {
  console.log("[v0] Publishing event with auth method:", authData.authMethod)

  let signedEvent

  switch (authData.authMethod) {
    case "nsec":
      if (!authData.privateKey) {
        throw new Error("Private key is missing for nsec login method.")
      }
      const privateKeyBytes = new Uint8Array(
        authData.privateKey.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) || [],
      )
      signedEvent = nostrTools.finalizeEvent(unsignedEvent, privateKeyBytes)
      console.log("[v0] Event signed locally using private key.")
      break

    case "remote":
      if (!authData.bunkerUri || !authData.clientSecretKey) {
        throw new Error("Remote signer connection data is missing. Please log in again.")
      }

      // Use signer manager - persistent connection, no popup!
      signedEvent = await signEventWithRemote(unsignedEvent, authData)
      console.log("[v0] Event signed by remote signer.")
      break

    case "extension":
      if (typeof window.nostr === "undefined") {
        throw new Error("Nostr browser extension not found.")
      }
      console.log("[v0] Requesting signature from browser extension...")
      signedEvent = await window.nostr.signEvent(unsignedEvent)
      console.log("[v0] Received signed event from browser extension.")
      break

    default:
      throw new Error("Unsupported authentication method for publishing.")
  }

  if (!signedEvent) {
    throw new Error("Event signing failed.")
  }

  // Get smart relay list with fallback
  let relays: string[]
  try {
    relays = await getSmartRelayList()
    console.log("[v0] 📡 Using smart relay list:", relays)
  } catch (error) {
    console.warn("[v0] ⚠️ Failed to get smart relays, using fallback:", error)
    relays = getRelays()
  }
  
  const pool = new nostrTools.SimplePool()

  try {
    console.log("[v0] 📤 Publishing to relays:", relays)
    await Promise.any(pool.publish(relays, signedEvent))
    console.log("[v0] ✅ Event published to at least one relay.")
  } catch (error) {
    console.error("[v0] ❌ Failed to publish event to any relay:", error)
    
    // Try with fallback relays if primary attempt failed
    if (relays.length > 3) {
      console.log("[v0] 🔄 Trying with fallback relays...")
      const fallbackRelays = relays.slice(3) // Use remaining relays
      try {
        await Promise.any(pool.publish(fallbackRelays, signedEvent))
        console.log("[v0] ✅ Event published to fallback relay.")
      } catch (fallbackError) {
        console.error("[v0] ❌ Fallback publish also failed:", fallbackError)
        throw new Error("Failed to publish event to the Nostr network.")
      }
    } else {
      throw new Error("Failed to publish event to the Nostr network.")
    }
  } finally {
    pool.close(relays)
  }

  return signedEvent.id
}
