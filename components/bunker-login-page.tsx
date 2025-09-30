"use client"

/**
 * NOSTR REMOTE SIGNER LOGIN COMPONENT
 *
 * This component implements NIP-46 (Nostr Connect) for remote signer authentication
 * Compatible with Nsec.app, Alby Hub, and other NIP-46 signers
 *
 * PROTOCOL: nostrconnect:// (NIP-46 standard format)
 *
 * CRITICAL ARCHITECTURE DECISIONS:
 * 1. 'use client' directive - Forces client-side only rendering to avoid SSR crypto issues
 * 2. Dynamic relay pool management - Ensures WebSocket connections work on Vercel
 * 3. Proper event subscription lifecycle - Critical for receiving approval events
 * 4. Ephemeral key pair for session security - Generated fresh each time
 * 5. Standard nostrconnect:// URL format - Compatible with all NIP-46 wallets
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { generateSecretKey, getPublicKey, nip44 } from "nostr-tools"
import { SimplePool } from "nostr-tools/pool"
import { Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QRCodeSVG } from "qrcode.react"

// Recommended relays for NIP-46 signaling
const DEFAULT_RELAYS = ["wss://relay.nsec.app", "wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

interface BunkerLoginPageProps {
  onLoginSuccess: (result: { pubkey: string; token: string; relay: string }) => void
  onBack?: () => void
}

type ConnectionStatus = "generating" | "awaiting_approval" | "success" | "error"

export function BunkerLoginPage({ onLoginSuccess, onBack }: BunkerLoginPageProps) {
  const [status, setStatus] = useState<ConnectionStatus>("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [connectUrl, setConnectUrl] = useState("")

  const appSecretKeyRef = useRef<Uint8Array | null>(null)
  const poolRef = useRef<SimplePool | null>(null)
  const subRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * CORE FUNCTION: Generate nostrconnect:// URL and listen for approval
   *
   * The NIP-46 nostrconnect protocol flow:
   * 1. Generate ephemeral keypair (local session keys)
   * 2. Create nostrconnect:// URL with metadata
   * 3. User scans QR code with their wallet or clicks "Use a signer" button
   * 4. Wallet connects to relays and sends encrypted "connect" response (kind 24133)
   * 5. We decrypt the response to get user's pubkey
   */
  const startConnection = useCallback(
    async (sk: Uint8Array) => {
      if (!sk) return

      try {
        const appPublicKey = getPublicKey(sk)
        const pool = new SimplePool()
        poolRef.current = pool

        console.log("[v0] 🔌 Connecting to relays:", DEFAULT_RELAYS)

        /**
         * CRITICAL SUBSCRIPTION LOGIC
         *
         * This is where most implementations fail. We must:
         * 1. Subscribe to kind 24133 events (NIP-46 response events)
         * 2. Filter for events tagged with our pubkey (#p tag)
         * 3. Listen from current timestamp forward (since: now)
         * 4. Handle the event immediately when it arrives
         */
        const now = Math.floor(Date.now() / 1000)
        const filters = [
          {
            kinds: [24133],
            "#p": [appPublicKey],
            since: now,
          },
        ]

        console.log("[v0] 📡 Subscribing for approval events with filters:", filters)
        console.log("[v0] 📡 Listening for events tagged with:", appPublicKey)

        const sub = pool.subscribeMany(DEFAULT_RELAYS, filters, {
          onevent: async (event: any) => {
            try {
              console.log("[v0] 📨 Received event from relay:", event)
              console.log("[v0] Event pubkey (remote signer):", event.pubkey)
              console.log("[v0] Event kind:", event.kind)
              console.log("[v0] Event content (encrypted):", event.content.substring(0, 50) + "...")

              const userPubkey = event.pubkey

              console.log("[v0] 🔓 Decrypting approval event...")

              const decryptedContent = await nip44.decrypt(sk, userPubkey, event.content)
              console.log("[v0] ✅ Decryption successful")
              console.log("[v0] 📋 Decrypted content:", decryptedContent)

              const response = JSON.parse(decryptedContent)
              console.log("[v0] 📦 Parsed response:", response)

              /**
               * The payload should contain:
               * - result: the user's actual pubkey or "ack" for connection approval
               * - id: request ID (for matching request/response)
               * - error: error message if connection failed
               */
              if (response.result === "ack" || response.result) {
                console.log("[v0] ✅ Connection approved!")

                sub.close()
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current)
                }

                setStatus("success")

                onLoginSuccess({
                  pubkey: userPubkey,
                  token: response.params?.[0] || "",
                  relay: DEFAULT_RELAYS[0],
                })
              } else if (response.error) {
                console.error("[v0] ❌ Connection rejected:", response.error)
                throw new Error(response.error)
              } else {
                console.log("[v0] ⚠️ Received event without result or error:", response)
              }
            } catch (e) {
              console.error("[v0] ❌ Error processing bunker response:", e)
              setStatus("error")
              setErrorMessage(e instanceof Error ? e.message : "Failed to process approval")
              cleanup()
            }
          },
          oneose: () => {
            console.log("[v0] ✅ Subscription established on relays")
          },
        })

        subRef.current = sub

        timeoutRef.current = setTimeout(() => {
          console.log("[v0] ⏱️ Approval timeout reached")
          setStatus("error")
          setErrorMessage("Connection timeout. Please try again.")
          cleanup()
        }, 120000)
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
        console.error("[v0] ❌ Bunker connection error:", error)
        cleanup()
      }
    },
    [onLoginSuccess],
  )

  /**
   * CLEANUP FUNCTION
   * Properly dispose of all resources to prevent leaks
   */
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (subRef.current) {
      subRef.current.close()
      subRef.current = null
    }
    if (poolRef.current) {
      poolRef.current.close(DEFAULT_RELAYS)
      poolRef.current = null
    }
  }, [])

  useEffect(() => {
    try {
      console.log("[v0] 🚀 Initializing nostr connect...")

      const sk = generateSecretKey()
      const pk = getPublicKey(sk)

      /**
       * CRITICAL: Create proper nostrconnect:// URL format
       *
       * This MUST follow the exact NIP-46 specification:
       * nostrconnect://<pubkey>?relay=<relay_url>&metadata=<url_encoded_json>
       *
       * The metadata should include app information for the wallet to display
       */
      const metadata = {
        name: "Nostr Journal",
        url: typeof window !== "undefined" ? window.location.origin : "",
        description: "Secure, private journaling on Nostr",
        icons: [`${typeof window !== "undefined" ? window.location.origin : ""}/icon.png`],
      }

      const encodedMetadata = encodeURIComponent(JSON.stringify(metadata))

      const relayParams = DEFAULT_RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join("&")

      const url = `nostrconnect://${pk}?${relayParams}&metadata=${encodedMetadata}`

      console.log("[v0] 🔑 Generated ephemeral keypair")
      console.log("[v0] 📱 Nostr Connect URI:", url)

      appSecretKeyRef.current = sk
      setConnectUrl(url)
      setStatus("awaiting_approval")

      startConnection(sk)
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
      console.error("[v0] ❌ Failed to initialize nostr connect:", e)
    }
  }, [startConnection])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  /**
   * Handle "Use a signer" button click
   * Opens the nostrconnect:// URL which compatible apps can intercept
   */
  const handleUseSignerClick = () => {
    if (connectUrl) {
      window.location.href = connectUrl
    }
  }

  const renderContent = () => {
    switch (status) {
      case "generating":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
            <p className="text-white">Generating Secure Connection...</p>
          </div>
        )

      case "awaiting_approval":
        return (
          <div>
            <h2 className="text-xl font-bold text-center mb-4 text-white">Approve Login</h2>
            <p className="text-center text-sm text-slate-400 mb-4">
              Scan with your Nostr wallet (Nsec.app, Alby Hub, etc.) to connect.
            </p>
            <div className="p-4 bg-white rounded-lg flex items-center justify-center mb-4">
              <QRCodeSVG value={connectUrl} size={256} level="M" />
            </div>
            <button
              onClick={handleUseSignerClick}
              className="block w-full text-center p-3 bg-indigo-600 rounded-lg font-semibold hover:bg-indigo-500 text-white transition-colors mb-2"
            >
              Use a signer
            </button>
            <div className="flex items-center justify-center mt-4 space-x-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Waiting for approval...</span>
            </div>
            <details className="mt-4">
              <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                Show connection URI
              </summary>
              <div className="mt-2 p-2 bg-slate-900 rounded text-xs font-mono break-all text-slate-300">
                {connectUrl}
              </div>
            </details>
          </div>
        )

      case "success":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <CheckCircle className="h-16 w-16 text-green-400" />
            <h2 className="text-xl font-bold text-white">Connection Successful!</h2>
            <p className="text-slate-400">Loading your journal...</p>
          </div>
        )

      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
            {onBack && (
              <Button onClick={onBack} variant="outline" className="mt-4 bg-transparent">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login Options
              </Button>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg bg-slate-800 p-6 shadow-lg border border-slate-700">
      {onBack && status === "awaiting_approval" && (
        <Button onClick={onBack} variant="ghost" className="mb-4 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      )}
      {renderContent()}
    </div>
  )
}
