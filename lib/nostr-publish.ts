import { finalizeEvent } from "nostr-tools"

export interface NostrEvent {
  id?: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig?: string
}

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec"
  privateKey?: string
}

// Simple SHA-256 implementation for event ID generation
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Create a Nostr event for a text note (kind 1)
export async function createNostrEvent(pubkey: string, content: string, tags: string[] = []): Promise<NostrEvent> {
  const event: NostrEvent = {
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1, // Text note
    tags: tags.map((tag) => ["t", tag]), // Convert tags to Nostr tag format
    content,
  }

  // Generate event ID by hashing the serialized event data
  const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])

  event.id = await sha256(serialized)

  return event
}

// Publish event using browser extension or NWC
export async function publishToNostr(event: NostrEvent, authData: AuthData): Promise<string> {
  console.log("[v0] Attempting to publish to Nostr:", event)
  console.log("[v0] Using auth method:", authData.authMethod)

  let signedEvent: NostrEvent

  if (authData.authMethod === "extension") {
    // Try browser extension signing
    if (typeof window !== "undefined" && (window as any).nostr) {
      try {
        signedEvent = await (window as any).nostr.signEvent(event)
        console.log("[v0] Event signed by browser extension:", signedEvent)
      } catch (error) {
        console.error("[v0] Error signing with browser extension:", error)
        throw new Error("Failed to sign event with browser extension")
      }
    } else {
      throw new Error("No Nostr browser extension available")
    }
  } else if (authData.authMethod === "nsec" && authData.privateKey) {
    // Sign locally using private key
    try {
      console.log("[v0] Signing event locally with nsec")

      // Convert hex private key to Uint8Array
      const privateKeyBytes = new Uint8Array(
        authData.privateKey.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
      )

      // Use nostr-tools to finalize the event (adds id and signature)
      signedEvent = finalizeEvent(event, privateKeyBytes)
      console.log("[v0] Event signed locally:", signedEvent)
    } catch (error) {
      console.error("[v0] Error signing with nsec:", error)
      throw new Error("Failed to sign event with private key")
    }
  } else {
    throw new Error("No valid signing method available")
  }

  // Popular Nostr relays for better visibility
  const relays = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://nostr.wine",
    "wss://relay.snort.social",
    "wss://nostr-pub.wellorder.net",
  ]

  let successfulPublishes = 0
  const publishPromises = relays.map(async (relayUrl) => {
    try {
      const ws = new WebSocket(relayUrl)

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close()
          resolve(false)
        }, 8000)

        ws.onopen = () => {
          clearTimeout(timeout)
          // Send EVENT message to relay
          ws.send(JSON.stringify(["EVENT", signedEvent]))
          console.log(`[v0] Published to relay: ${relayUrl}`)
          successfulPublishes++

          // Wait a bit for potential response, then close
          setTimeout(() => {
            ws.close()
            resolve(true)
          }, 1000)
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          console.log(`[v0] Failed to connect to ${relayUrl}`)
          resolve(false)
        }

        ws.onmessage = (message) => {
          try {
            const response = JSON.parse(message.data)
            if (response[0] === "OK" && response[1] === signedEvent.id) {
              console.log(`[v0] Relay ${relayUrl} confirmed: ${response[2] ? "accepted" : "rejected"}`)
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      })
    } catch (error) {
      console.log(`[v0] Error with relay ${relayUrl}:`, error)
      return false
    }
  })

  // Wait for all relay attempts to complete
  await Promise.allSettled(publishPromises)

  console.log(`[v0] Successfully published to ${successfulPublishes} out of ${relays.length} relays`)

  if (successfulPublishes > 0) {
    return signedEvent.id || event.id || "unknown"
  } else {
    throw new Error("Failed to publish to any relay")
  }
}
