"use client"

import * as nostrTools from "nostr-tools"
import { getSmartRelayList, getRelays } from "./relay-manager"
import { signEventWithRemote } from "./signer-manager"
import { validateEvent, logValidationResult } from "./event-validator"

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
  console.log("[Publish] 🚀 Starting publish process with auth method:", authData.authMethod)
  console.log("[Publish] 📝 Event details:", { 
    kind: unsignedEvent.kind, 
    content: unsignedEvent.content?.substring(0, 50) + "...", 
    tags: unsignedEvent.tags?.length || 0 
  })

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
      console.log("[Publish] ✅ Event signed locally using private key")
      break

    case "remote":
      if (!authData.bunkerUri || !authData.clientSecretKey) {
        throw new Error("Remote signer connection data is missing. Please log in again.")
      }

      // Use signer manager - persistent connection, no popup!
      signedEvent = await signEventWithRemote(unsignedEvent, authData)
      console.log("[Publish] ✅ Event signed by remote signer")
      break

    case "extension":
      if (typeof window.nostr === "undefined") {
        throw new Error("Nostr browser extension not found.")
      }
      console.log("[Publish] 🔌 Requesting signature from browser extension...")
      signedEvent = await window.nostr.signEvent(unsignedEvent)
      console.log("[Publish] ✅ Received signed event from browser extension")
      break

    default:
      throw new Error("Unsupported authentication method for publishing.")
  }

  if (!signedEvent) {
    throw new Error("Event signing failed.")
  }

  // Validate event structure
  const validation = validateEvent(signedEvent)
  logValidationResult(signedEvent, validation)
  
  if (!validation.isValid) {
    throw new Error(`Event validation failed: ${validation.errors.join(", ")}`)
  }

  console.log("[Publish] 🔍 Event signature valid:", !!signedEvent.sig)
  console.log("[Publish] 🆔 Event ID:", signedEvent.id)

  // Get smart relay list with fallback
  let relays: string[]
  try {
    relays = await getSmartRelayList()
    console.log("[Publish] 📡 Using smart relay list:", relays)
  } catch (error) {
    console.warn("[Publish] ⚠️ Failed to get smart relays, using fallback:", error)
    relays = getRelays()
  }
  
  // Publish to each relay individually and track results
  const relayResults = await publishToRelaysIndividually(signedEvent, relays)
  
  const successfulRelays = relayResults.filter(r => r.success)
  const failedRelays = relayResults.filter(r => !r.success)

  console.log("[Publish] 📊 Relay Results:")
  console.log("✅ Successful:", successfulRelays.map(r => r.url))
  console.log("❌ Failed:", failedRelays.map(r => `${r.url}: ${r.error}`))

  if (successfulRelays.length === 0) {
    throw new Error(`Failed to publish to any relay. Errors: ${failedRelays.map(r => r.error).join(", ")}`)
  }

  console.log("[Publish] 🎉 Successfully published to", successfulRelays.length, "relay(s)")
  return signedEvent.id
}

// Helper function to publish to relays individually and track results
async function publishToRelaysIndividually(signedEvent: any, relays: string[]): Promise<Array<{url: string, success: boolean, error?: string}>> {
  const results = []
  
  for (const relayUrl of relays) {
    try {
      console.log("[Publish] 📤 Publishing to", relayUrl)
      const success = await publishToSingleRelay(relayUrl, signedEvent)
      results.push({ url: relayUrl, success })
      if (success) {
        console.log("[Publish] ✅ Success on", relayUrl)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[Publish] ❌ Failed on", relayUrl, ":", errorMsg)
      results.push({ url: relayUrl, success: false, error: errorMsg })
    }
  }
  
  return results
}

// Helper function to publish to a single relay with proper OK response handling
async function publishToSingleRelay(relayUrl: string, signedEvent: any): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl)
    let resolved = false
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ws.close()
        reject(new Error(`Timeout connecting to ${relayUrl}`))
      }
    }, 10000) // 10 second timeout
    
    ws.onopen = () => {
      console.log("[Publish] 🔗 Connected to", relayUrl)
      ws.send(JSON.stringify(["EVENT", signedEvent]))
    }
    
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        
        if (data[0] === "OK" && data[1] === signedEvent.id) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            ws.close()
            console.log("[Publish] ✅ Received OK from", relayUrl)
            resolve(true)
          }
        } else if (data[0] === "NOTICE") {
          console.warn("[Publish] ⚠️ Notice from", relayUrl, ":", data[1])
        } else if (data[0] === "OK" && data[1] !== signedEvent.id) {
          // Different event ID - this shouldn't happen but let's log it
          console.warn("[Publish] ⚠️ Unexpected event ID in OK response from", relayUrl)
        }
      } catch (error) {
        console.error("[Publish] ❌ Error parsing message from", relayUrl, ":", error)
      }
    }
    
    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        console.error("[Publish] ❌ WebSocket error on", relayUrl, ":", error)
        reject(new Error(`WebSocket error: ${error}`))
      }
    }
    
    ws.onclose = (event) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        if (event.code !== 1000) {
          console.error("[Publish] ❌ Connection closed unexpectedly on", relayUrl, "Code:", event.code)
          reject(new Error(`Connection closed: ${event.code}`))
        }
      }
    }
  })
}
