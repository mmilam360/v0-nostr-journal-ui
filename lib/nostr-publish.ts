"use client"

import * as nostrTools from "nostr-tools"

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

      try {
        console.log("[v0] Creating fresh remote signer connection...")

        // Import required modules
        const { SimplePool } = await import("nostr-tools/pool")
        const { BunkerSigner } = await import("nostr-tools/nip46")

        // Create a new pool for this signing session
        const pool = new SimplePool()

        // Create a fresh BunkerSigner from the stored URI
        console.log("[v0] Connecting to remote signer...")
        const signer = await BunkerSigner.fromURI(authData.clientSecretKey, authData.bunkerUri, {
          pool,
          timeout: 60000, // 60 second timeout for signing
        })

        console.log("[v0] Remote signer connected, requesting signature...")
        // The BunkerSigner will trigger the approval popup in the user's remote signer app
        signedEvent = await signer.signEvent(unsignedEvent)
        console.log("[v0] Received signed event from remote signer.")

        // Clean up the signer connection
        try {
          await signer.close()
          pool.close(authData.relays || [])
        } catch (cleanupError) {
          console.log("[v0] Cleanup error (non-critical):", cleanupError)
        }
      } catch (signerError: any) {
        console.error("[v0] Remote signer error:", signerError)
        if (signerError.message?.includes("timeout")) {
          throw new Error(
            "Remote signer connection timeout. Make sure you approved the request in your remote signer app (Nsec.app or Alby).",
          )
        } else if (signerError.message?.includes("rejected")) {
          throw new Error("Signing request was rejected by your remote signer.")
        }
        throw new Error(`Failed to sign with remote signer: ${signerError.message || "Unknown error"}`)
      }
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

  const relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.nostr.band"]
  const pool = new nostrTools.SimplePool()

  try {
    console.log("[v0] Publishing to relays...")
    await Promise.any(pool.publish(relays, signedEvent))
    console.log("[v0] Event published to at least one relay.")
  } catch (error) {
    console.error("[v0] Failed to publish event to any relay:", error)
    throw new Error("Failed to publish event to the Nostr network.")
  } finally {
    pool.close(relays)
  }

  return signedEvent.id
}
