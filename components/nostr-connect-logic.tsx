"use client"
import { useState, useCallback, useEffect } from "react"
import { generateSecretKey, getPublicKey, nip04, finalizeEvent } from "nostr-tools"
import { SimplePool } from "nostr-tools/pool"
import { Loader2, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

const NWC_RELAYS = ["wss://relay.getalby.com/v1", "wss://relay.damus.io", "wss://nostr.mutinywallet.com"]

const useNostrConnect = ({ onConnectSuccess }: { onConnectSuccess: (result: { pubkey: string }) => void }) => {
  const [status, setStatus] = useState("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [connectUri, setConnectUri] = useState("")
  const [appSecretKey, setAppSecretKey] = useState<Uint8Array | null>(null)

  const generateConnectUri = useCallback(() => {
    try {
      const sk = generateSecretKey()
      const pk = getPublicKey(sk)
      const metadata = JSON.stringify({ name: "Nostr Journal", url: "https://nostrjournal.app" })
      const uri = `nostrconnect://${pk}?relay=${NWC_RELAYS[0]}&metadata=${encodeURIComponent(metadata)}`

      console.log("[v0] Generated nostrconnect URI:", uri.substring(0, 50) + "...")
      setAppSecretKey(sk)
      setConnectUri(uri)
      setStatus("awaiting_approval")
    } catch (e) {
      console.error("[v0] Failed to generate connection key:", e)
      setStatus("error")
      setErrorMessage("Failed to generate a secure connection key.")
    }
  }, [])

  const startListeningAndAwaitApproval = useCallback(async () => {
    if (!appSecretKey || !connectUri) return
    let pool: SimplePool | null = null
    try {
      const appPublicKey = getPublicKey(appSecretKey)

      console.log("[v0] Starting NIP-46 handshake...")
      console.log("[v0] App public key:", appPublicKey)

      const url = new URL(connectUri)
      const walletPubkey = url.hostname
      const walletRelay = url.searchParams.get("relay") || NWC_RELAYS[0]

      console.log("[v0] Wallet pubkey:", walletPubkey)
      console.log("[v0] Wallet relay:", walletRelay)

      const connectPayload = {
        method: "connect",
        params: [appPublicKey],
      }

      console.log("[v0] Connect payload:", connectPayload)

      const sharedSecret = nip04.getSharedSecret(appSecretKey, walletPubkey)
      const encryptedPayload = await nip04.encrypt(sharedSecret, JSON.stringify(connectPayload))

      const requestEvent = finalizeEvent(
        {
          kind: 24133,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", walletPubkey]],
          content: encryptedPayload,
        },
        appSecretKey,
      )

      console.log("[v0] Sending connect request to wallet relay...")

      pool = new SimplePool()
      await pool.ensureRelay(walletRelay)
      await Promise.any(pool.publish([walletRelay], requestEvent))

      console.log("[v0] Connect request sent! Now listening for response on multiple relays...")

      const responsePromise = new Promise<{ pubkey: string }>((resolve, reject) => {
        const sub = pool!.subscribeMany(NWC_RELAYS, [{ kinds: [24133], "#p": [appPublicKey] }], {
          onevent: async (event: any) => {
            console.log("[v0] Received response event from relay")
            console.log("[v0] Event author (user's pubkey):", event.pubkey)
            try {
              const userPubkey = event.pubkey
              const sharedSecret = nip04.getSharedSecret(appSecretKey, userPubkey)
              const decrypted = await nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decrypted)

              console.log("[v0] Decrypted response:", response)

              if (response.result === "connect" || response.result_type === "connect") {
                console.log("[v0] Connection approved! User pubkey:", userPubkey)
                sub.close()
                resolve({ pubkey: userPubkey })
              } else if (response.error) {
                console.error("[v0] Connection rejected:", response.error)
                sub.close()
                reject(new Error(response.error.message || "Connection rejected by the wallet."))
              }
            } catch (e) {
              console.warn("[v0] Could not decrypt event, ignoring:", e)
            }
          },
        })

        setTimeout(() => {
          console.log("[v0] Approval timeout reached")
          reject(new Error("Approval timed out. Please scan and approve within 2 minutes."))
        }, 120000)
      })

      const result = await responsePromise
      setStatus("success")
      onConnectSuccess(result)
    } catch (error) {
      console.error("[v0] Connection error:", error)
      setStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "Connection failed")
    } finally {
      if (pool) pool.close(NWC_RELAYS)
    }
  }, [appSecretKey, connectUri, onConnectSuccess])

  useEffect(() => {
    generateConnectUri()
  }, [generateConnectUri])

  return { status, errorMessage, connectUri, startListeningAndAwaitApproval }
}

interface NostrConnectLogicProps {
  onConnectSuccess: (result: { pubkey: string }) => void
  onClose: () => void
}

export default function NostrConnectLogic({ onConnectSuccess, onClose }: NostrConnectLogicProps) {
  const { status, errorMessage, connectUri, startListeningAndAwaitApproval } = useNostrConnect({ onConnectSuccess })

  useEffect(() => {
    if (status === "awaiting_approval") {
      startListeningAndAwaitApproval()
    }
  }, [status, startListeningAndAwaitApproval])

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
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-2">Approve Login</h2>
              <p className="text-sm text-slate-400">
                Scan with a compatible app like Nsec.app, Alby, or Amethyst to connect your account securely.
              </p>
            </div>

            <div className="flex justify-center">
              <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(connectUri)}`}
                  alt="Nostr Connect QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <Button
              onClick={() => window.open(connectUri, "_blank")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Signing App
            </Button>

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
            <p className="text-slate-400 text-center">Your signing app is now connected securely.</p>
          </div>
        )

      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
            <div className="flex space-x-2 w-full max-w-xs">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
              >
                Cancel
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Try Again
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return <div className="p-2">{renderContent()}</div>
}
