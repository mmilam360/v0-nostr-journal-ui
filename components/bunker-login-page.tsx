"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { generateSecretKey, getPublicKey, nip04 } from "nostr-tools"
import { SimplePool } from "nostr-tools/pool"
import { Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

const DEFAULT_RELAYS = ["wss://relay.nostr.band", "wss://relay.damus.io", "wss://nos.lol"]

interface BunkerLoginPageProps {
  onLoginSuccess: (result: { pubkey: string; token: string; relay: string }) => void
  onBack?: () => void
}

type ConnectionStatus = "generating" | "awaiting_approval" | "success" | "error"

export function BunkerLoginPage({ onLoginSuccess, onBack }: BunkerLoginPageProps) {
  const [status, setStatus] = useState<ConnectionStatus>("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [bunkerUri, setBunkerUri] = useState("")
  const appSecretKeyRef = useRef<Uint8Array | null>(null)
  const poolRef = useRef<SimplePool | null>(null)

  const startConnection = useCallback(
    async (sk: Uint8Array) => {
      if (!sk) return

      try {
        const appPublicKey = getPublicKey(sk)
        const pool = new SimplePool()
        poolRef.current = pool

        console.log("[v0] 🔌 Connecting to relays:", DEFAULT_RELAYS)

        await Promise.all(DEFAULT_RELAYS.map((relay) => pool.ensureRelay(relay)))
        console.log("[v0] ✅ Connected to all relays")

        const now = Math.floor(Date.now() / 1000)
        const filters = [
          {
            kinds: [24133],
            "#p": [appPublicKey],
            since: now,
          },
        ]

        console.log("[v0] 📡 Subscribing for approval events with filters:", filters)

        const responsePromise = new Promise<{ pubkey: string; token: string; relay: string }>((resolve, reject) => {
          const sub = pool.subscribeMany(DEFAULT_RELAYS, filters, {
            onevent: async (event: any) => {
              try {
                console.log("[v0] 📨 Received event from relay")
                console.log("[v0] Event pubkey:", event.pubkey)
                console.log("[v0] Event kind:", event.kind)

                const userPubkey = event.pubkey

                console.log("[v0] 🔓 Decrypting approval event...")
                const decryptedContent = await nip04.decrypt(sk, userPubkey, event.content)
                console.log("[v0] ✅ Decryption successful")

                const response = JSON.parse(decryptedContent)
                console.log("[v0] 📦 Parsed response:", response)

                if (response.result === "ack") {
                  console.log("[v0] ✅ Connection approved!")
                  sub.close()
                  resolve({
                    pubkey: userPubkey,
                    token: response.params?.[0] || "",
                    relay: DEFAULT_RELAYS[0],
                  })
                } else {
                  console.error("[v0] ❌ Connection rejected:", response.error)
                  reject(new Error(response.error || "Connection rejected."))
                }
              } catch (e) {
                console.error("[v0] ❌ Error processing bunker response:", e)
                reject(e)
              }
            },
            oneose: () => {
              console.log("[v0] 📡 Subscription established on all relays")
            },
          })

          // Timeout after 2 minutes
          setTimeout(() => {
            console.log("[v0] ⏱️ Approval timeout reached")
            sub.close()
            reject(new Error("Approval timed out. Please try again."))
          }, 120000)
        })

        const result = await responsePromise
        console.log("[v0] 🎉 Login successful! User pubkey:", result.pubkey)

        setStatus("success")
        onLoginSuccess(result)
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
        console.error("[v0] ❌ Bunker connection error:", error)
      } finally {
        if (poolRef.current) {
          poolRef.current.close(DEFAULT_RELAYS)
          poolRef.current = null
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
      const uri = `bunker://${pk}?relay=${DEFAULT_RELAYS[0]}`

      console.log("[v0] 🔑 Generated ephemeral keypair")
      console.log("[v0] 📱 Bunker URI:", uri)

      appSecretKeyRef.current = sk
      setBunkerUri(uri)
      setStatus("awaiting_approval")

      startConnection(sk)
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
      console.error("[v0] ❌ Failed to initialize bunker connection:", e)
    }
  }, [startConnection])

  useEffect(() => {
    return () => {
      if (poolRef.current) {
        poolRef.current.close(DEFAULT_RELAYS)
      }
    }
  }, [])

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
              Scan with a Bunker-compatible app like Nsec.app to connect.
            </p>
            {/* QR Code using the QR Server API */}
            <div className="p-4 bg-white rounded-lg flex items-center justify-center mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(bunkerUri)}`}
                alt="Bunker Connection QR Code"
                className="w-64 h-64"
              />
            </div>
            <a
              href={bunkerUri}
              className="block w-full text-center p-3 bg-indigo-600 rounded-lg font-semibold hover:bg-indigo-500 text-white transition-colors"
            >
              Open in Signing App
            </a>
            <div className="flex items-center justify-center mt-4 space-x-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Waiting for approval...</span>
            </div>
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
