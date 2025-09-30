"use client"

import { useState, useCallback, useEffect } from "react"
import * as nostrTools from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

// This is the relay specified by the noauth protocol for handshakes.
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
  const [appSecretKey, setAppSecretKey] = useState<Uint8Array | null>(null)

  const startConnection = useCallback(
    async (sk: Uint8Array) => {
      if (!sk) return
      let relay: any
      try {
        const appPublicKey = nostrTools.getPublicKey(sk)
        relay = nostrTools.relayInit(NOAUTH_RELAY)

        await new Promise((resolve, reject) => {
          relay.on("connect", resolve)
          relay.on("error", reject)
          relay.connect().catch(reject)
          setTimeout(() => reject(new Error("Relay connection timed out")), 7000)
        })

        const sub = relay.sub([{ kinds: [24133], "#p": [appPublicKey] }])

        const responsePromise = new Promise<{ pubkey: string; token: string; relay: string }>((resolve, reject) => {
          sub.on("event", async (event: any) => {
            try {
              const userPubkey = event.pubkey
              const sharedSecret = nostrTools.nip04.getSharedSecret(sk, userPubkey)
              const decryptedContent = await nostrTools.nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decryptedContent)

              if (response.result === "ack") {
                resolve({
                  pubkey: userPubkey,
                  token: response.params[0],
                  relay: NOAUTH_RELAY,
                })
              } else {
                reject(new Error(response.error || "Connection rejected."))
              }
            } catch (e) {
              console.error("[v0] Error processing bunker response:", e)
            }
          })
        })

        const result = await Promise.race([
          responsePromise,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Approval timed out.")), 120000)),
        ])

        setStatus("success")
        onLoginSuccess(result)
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
        console.error("[v0] Bunker connection error:", error)
      } finally {
        if (relay) relay.close()
      }
    },
    [onLoginSuccess],
  )

  useEffect(() => {
    try {
      const sk = nostrTools.generateSecretKey()
      const pk = nostrTools.getPublicKey(sk)
      const uri = `bunker://${pk}?relay=${NOAUTH_RELAY}`

      setAppSecretKey(sk)
      setBunkerUri(uri)
      setStatus("awaiting_approval")

      startConnection(sk)
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
      console.error("[v0] Failed to initialize bunker connection:", e)
    }
  }, [startConnection])

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
