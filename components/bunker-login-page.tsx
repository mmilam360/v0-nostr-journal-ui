"use client"

/**
 * NOSTR REMOTE SIGNER LOGIN COMPONENT
 *
 * This component implements the bunker:// (noauth) protocol for remote signer authentication
 * Compatible with Nsec.app and other bunker-compatible signers
 *
 * PROTOCOL: bunker:// (noauth standard format)
 *
 * CRITICAL ARCHITECTURE DECISIONS:
 * 1. 'use client' directive - Forces client-side only rendering to avoid SSR crypto issues
 * 2. Uses nostr-fetch with allEventsIterator for real-time subscriptions
 * 3. Single relay strategy (wss://relay.nostr.band) as specified by noauth protocol
 * 4. Ephemeral key pair for session security - Generated fresh each time
 * 5. Standard bunker:// URL format - Compatible with bunker signers
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { generateSecretKey, getPublicKey, nip04 } from "nostr-tools"
import { NostrFetcher } from "nostr-fetch"
import { Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QRCodeSVG } from "qrcode.react"

const NOAUTH_RELAY = "wss://relay.nostr.band"

interface BunkerLoginPageProps {
  onLoginSuccess: (result: { pubkey: string; token: string; relay: string }) => void
  onBack?: () => void
}

type ConnectionStatus = "generating" | "awaiting_approval" | "success" | "error"

export function BunkerLoginPage({ onLoginSuccess, onBack }: BunkerLoginPageProps) {
  const [status, setStatus] = useState<ConnectionStatus>("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [bunkerUri, setBunkerUri] = useState("")
  const [userPubkey, setUserPubkey] = useState("")

  const appSecretKeyRef = useRef<Uint8Array | null>(null)
  const fetcherRef = useRef<NostrFetcher | null>(null)

  /**
   * CORE FUNCTION: Generate bunker:// URI and listen for approval
   *
   * The bunker:// (noauth) protocol flow:
   * 1. Generate ephemeral keypair (local session keys)
   * 2. Create bunker:// URL with relay parameter
   * 3. User scans QR code with their wallet or clicks the link
   * 4. Wallet connects to the noauth relay and sends approval event
   * 5. Client listens for kind 24133 events with result === "ack"
   * 6. Extract user's pubkey from the event
   */
  const startConnection = useCallback(
    async (sk: Uint8Array, pk: string) => {
      let fetcher: NostrFetcher | null = null

      try {
        console.log("[v0] 🔌 Initializing nostr-fetch...")
        fetcher = NostrFetcher.init()
        fetcherRef.current = fetcher

        console.log("[v0] 📡 Subscribing to relay:", NOAUTH_RELAY)
        console.log("[v0] 📡 Listening for events tagged with:", pk)

        const sub = fetcher.allEventsIterator(
          [NOAUTH_RELAY],
          { kinds: [24133] },
          { "#p": [pk] },
          { realTime: true, timeout: 120000 },
        )

        console.log("[v0] 🔍 Waiting for approval event...")

        for await (const event of sub) {
          try {
            console.log("[v0] 📨 RECEIVED EVENT")
            console.log("[v0] Event pubkey:", event.pubkey)
            console.log("[v0] Event kind:", event.kind)

            const remotePubkey = event.pubkey
            console.log("[v0] 🔓 Decrypting event content...")

            const sharedSecret = nip04.getSharedSecret(sk, remotePubkey)
            const decryptedContent = await nip04.decrypt(sharedSecret, event.content)

            console.log("[v0] ✅ Decryption successful!")
            console.log("[v0] 📋 Decrypted content:", decryptedContent)

            const response = JSON.parse(decryptedContent)
            console.log("[v0] 📦 Parsed response:", JSON.stringify(response, null, 2))

            if (response.result === "ack") {
              console.log("[v0] ✅ CONNECTION SUCCESSFUL!")
              console.log("[v0] 👤 User pubkey:", remotePubkey)

              setStatus("success")
              setUserPubkey(remotePubkey)

              // Extract session token if provided
              const token = response.params?.[0] || ""

              onLoginSuccess({
                pubkey: remotePubkey,
                token,
                relay: NOAUTH_RELAY,
              })

              return // Exit the loop and function
            } else if (response.error) {
              console.error("[v0] ❌ Remote signer returned error:", response.error)
              throw new Error(response.error)
            }
          } catch (e) {
            console.log(
              "[v0] ⚠️ Could not decrypt event (likely not for us):",
              e instanceof Error ? e.message : String(e),
            )
          }
        }

        // If we exit the loop, it means the subscription timed out
        throw new Error("Approval timed out. Please try again.")
      } catch (error) {
        console.error("[v0] ❌ Connection error:", error)
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
      } finally {
        if (fetcher) {
          console.log("[v0] 🧹 Cleaning up connection...")
          fetcher.shutdown()
        }
      }
    },
    [onLoginSuccess],
  )

  useEffect(() => {
    try {
      console.log("[v0] 🚀 Initializing bunker connection...")

      const sk = generateSecretKey()
      const pk = getPublicKey(sk)

      const uri = `bunker://${pk}?relay=${NOAUTH_RELAY}`

      console.log("[v0] 🔑 Generated ephemeral keypair")
      console.log("[v0] 📱 Bunker URI:", uri)

      appSecretKeyRef.current = sk
      setBunkerUri(uri)
      setStatus("awaiting_approval")

      // Start listening for approval
      startConnection(sk, pk)
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
      console.error("[v0] ❌ Failed to initialize:", e)
    }

    // Cleanup on unmount
    return () => {
      if (fetcherRef.current) {
        console.log("[v0] 🧹 Component unmounting, cleaning up...")
        fetcherRef.current.shutdown()
      }
    }
  }, [startConnection])

  /**
   * Handle "Open in Signing App" button click
   * Opens the bunker:// URL which compatible apps can intercept
   */
  const handleOpenSignerClick = () => {
    if (bunkerUri) {
      window.location.href = bunkerUri
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
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
              <p className="text-sm text-blue-200 mb-2">
                <strong>To connect:</strong>
              </p>
              <ol className="text-xs text-blue-300 space-y-1 list-decimal list-inside">
                <li>Open a bunker-compatible app (Nsec.app, Amber, etc.)</li>
                <li>Scan the QR code below or click "Open in Signing App"</li>
                <li>Approve the connection request in your app</li>
              </ol>
            </div>
            <p className="text-center text-sm text-slate-400 mb-4">
              Scan with a Bunker-compatible app like Nsec.app to connect.
            </p>
            <div className="p-4 bg-white rounded-lg flex items-center justify-center mb-4">
              <QRCodeSVG value={bunkerUri} size={256} level="M" />
            </div>
            <button
              onClick={handleOpenSignerClick}
              className="block w-full text-center p-3 bg-indigo-600 rounded-lg font-semibold hover:bg-indigo-500 text-white transition-colors mb-2"
            >
              Open in Signing App
            </button>
            <div className="flex items-center justify-center mt-4 space-x-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Waiting for approval (2 min timeout)...</span>
            </div>
            <p className="text-xs text-slate-500 text-center mt-2">
              Connection will timeout after 2 minutes if not approved
            </p>
            <details className="mt-4">
              <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                Show connection URI
              </summary>
              <div className="mt-2 p-2 bg-slate-900 rounded text-xs font-mono break-all text-slate-300">
                {bunkerUri}
              </div>
            </details>
          </div>
        )

      case "success":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <CheckCircle className="h-16 w-16 text-green-400" />
            <h2 className="text-xl font-bold text-white">Connection Successful!</h2>
            <p className="text-slate-400">Welcome back.</p>
            {userPubkey && (
              <p className="text-xs text-slate-400 font-mono break-all bg-slate-900 p-2 rounded-md max-w-xs">
                {userPubkey}
              </p>
            )}
          </div>
        )

      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
            <div className="mt-4 p-3 bg-slate-900 rounded-lg text-left max-w-xs">
              <p className="text-xs text-slate-400 mb-2">
                <strong>Troubleshooting:</strong>
              </p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>Make sure you scanned the QR code with a compatible app</li>
                <li>Check that your signing app is connected to the internet</li>
                <li>Try using a different signing app (Nsec.app, Amber)</li>
                <li>Make sure you approved the connection in your app</li>
              </ul>
            </div>
            <div className="flex gap-2 mt-4">
              {onBack && (
                <Button onClick={onBack} variant="outline" className="bg-transparent">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <Button onClick={() => window.location.reload()} className="bg-indigo-600 hover:bg-indigo-500">
                Try Again
              </Button>
            </div>
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
