"use client"
import { useState, useCallback, useEffect } from "react"
import { generateSecretKey, getPublicKey, relayInit, nip04 } from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

const useNostrConnect = ({ onConnectSuccess }: { onConnectSuccess: (result: { pubkey: string }) => void }) => {
  const [status, setStatus] = useState("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [connectUri, setConnectUri] = useState("")
  const [appSecretKey, setAppSecretKey] = useState<Uint8Array | null>(null)

  const generateConnectUri = useCallback(() => {
    try {
      const sk = generateSecretKey()
      const pk = getPublicKey(sk)
      const relay = "wss://relay.getalby.com/v1"
      const uri = `nostrconnect://${pk}?relay=${relay}&metadata=${JSON.stringify({ name: "Nostr Journal" })}`

      setAppSecretKey(sk) // Save the secret key in our state
      setConnectUri(uri)
      setStatus("awaiting_approval") // Move to the main display state
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
    }
  }, [])

  const startListeningAndAwaitApproval = useCallback(async () => {
    if (!appSecretKey) return
    let relay
    try {
      const appPublicKey = getPublicKey(appSecretKey)
      relay = relayInit("wss://relay.getalby.com/v1")
      await new Promise((resolve, reject) => {
        relay.on("connect", resolve)
        relay.on("error", reject)
        relay.connect().catch(reject)
        setTimeout(() => reject(new Error("Relay connection timed out")), 7000)
      })

      const sub = relay.sub([{ kinds: [24133], "#p": [appPublicKey] }])
      const responsePromise = new Promise<{ pubkey: string }>((resolve, reject) => {
        sub.on("event", async (event) => {
          try {
            const sharedSecret = nip04.getSharedSecret(appSecretKey, event.pubkey)
            const decrypted = await nip04.decrypt(sharedSecret, event.content)
            const response = JSON.parse(decrypted)

            // Handle different valid response formats from wallets
            if (response.result === "auth_url" || response.result === true || response.result_type === "connect") {
              resolve({ pubkey: event.pubkey })
            } else {
              reject(new Error(response.error?.message || "Connection rejected."))
            }
          } catch (e) {
            // Ignore decryption errors, might be other events
          }
        })
      })

      const result = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Approval timed out.")), 120000)),
      ])
      setStatus("success")
      onConnectSuccess(result)
    } catch (error) {
      setStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "Connection failed")
    } finally {
      if (relay) relay.close()
    }
  }, [appSecretKey, onConnectSuccess])

  // Generate the URI once on mount
  useEffect(() => {
    generateConnectUri()
  }, [generateConnectUri])

  // Return the new listener function to be called by the UI
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
              <p className="text-sm text-slate-400">Scan with an app like Nsec.app to connect your account securely.</p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(connectUri)}`}
                  alt="Nostr Connect QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Action Button */}
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
