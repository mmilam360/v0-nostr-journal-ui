"use client"
import { useState, useCallback, useRef } from "react"
import { generateSecretKey, getPublicKey, nip04 } from "nostr-tools"
import { NostrFetcher } from "nostr-fetch"

type BunkerState = "generating" | "awaiting_approval" | "success" | "error"

interface BunkerConnection {
  state: BunkerState
  connectionString: string
  qrCodeData: string
  error: string | null
  connect: () => void
  reset: () => void
}

const NOAUTH_RELAY = "wss://relay.nostr.band"

export function useBunkerConnection(): BunkerConnection {
  const [state, setState] = useState<BunkerState>("generating")
  const [connectionString, setConnectionString] = useState("")
  const [qrCodeData, setQrCodeData] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fetcherRef = useRef<NostrFetcher | null>(null)

  const connect = useCallback(async () => {
    setState("generating")
    setError(null)

    try {
      // Generate a temporary keypair for the connection
      const tempSecretKey = generateSecretKey()
      const tempPublicKey = getPublicKey(tempSecretKey)

      // Create bunker connection string
      const bunkerUrl = `bunker://${tempPublicKey}?relay=${NOAUTH_RELAY}`

      setConnectionString(bunkerUrl)
      setQrCodeData(bunkerUrl)
      setState("awaiting_approval")

      console.log("[v0] Bunker connection initiated:", bunkerUrl)

      // Initialize fetcher and start listening for approval
      const fetcher = NostrFetcher.init()
      fetcherRef.current = fetcher

      console.log("[v0] 📡 Listening for approval on relay:", NOAUTH_RELAY)

      const sub = fetcher.allEventsIterator(
        [NOAUTH_RELAY],
        { kinds: [24133] },
        { "#p": [tempPublicKey] },
        { realTime: true, timeout: 120000 }
      )

      for await (const event of sub) {
        try {
          console.log("[v0] 📨 Received event from:", event.pubkey)
          
          const sharedSecret = nip04.getSharedSecret(tempSecretKey, event.pubkey)
          const decryptedContent = await nip04.decrypt(sharedSecret, event.content)
          const response = JSON.parse(decryptedContent)

          console.log("[v0] 📦 Decrypted response:", response)

          if (response.result === "ack") {
            console.log("[v0] ✅ Bunker connection approved!")
            setState("success")
            return
          } else if (response.error) {
            throw new Error(response.error.message || "Connection rejected")
          }
        } catch (e) {
          console.log("[v0] ⚠️ Could not decrypt event:", e)
        }
      }

      // If we exit the loop, it means timeout
      throw new Error("Connection timeout. Please try again or check that your signing app is running.")
    } catch (err) {
      console.error("[v0] Bunker connection error:", err)
      setState("error")
      setError(err instanceof Error ? err.message : "Failed to establish bunker connection")
    } finally {
      if (fetcherRef.current) {
        fetcherRef.current.shutdown()
        fetcherRef.current = null
      }
    }
  }, [])

  const reset = useCallback(() => {
    if (fetcherRef.current) {
      fetcherRef.current.shutdown()
      fetcherRef.current = null
    }
    setState("generating")
    setConnectionString("")
    setQrCodeData("")
    setError(null)
  }, [])

  return {
    state,
    connectionString,
    qrCodeData,
    error,
    connect,
    reset,
  }
}
