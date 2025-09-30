"use client"

import { useState, useCallback, useEffect } from "react"
import * as nostrTools from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react"

// This is the relay specified by the noauth protocol for handshakes.
const NOAUTH_RELAY = "wss://relay.nostr.band"

interface BunkerConnectionResult {
  pubkey: string
  token: string
  relay: string
}

interface UseBunkerConnectionProps {
  onConnectSuccess: (result: BunkerConnectionResult) => void
}

const useBunkerConnection = ({ onConnectSuccess }: UseBunkerConnectionProps) => {
  const [status, setStatus] = useState<"generating" | "awaiting_approval" | "success" | "error">("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [bunkerUri, setBunkerUri] = useState("")
  const [appSecretKey, setAppSecretKey] = useState<Uint8Array | null>(null)

  // Step 1: Generate the correct `bunker://` URI.
  const generateBunkerUri = useCallback(() => {
    try {
      const sk = nostrTools.generateSecretKey()
      const pk = nostrTools.getPublicKey(sk)
      const uri = `bunker://${pk}?relay=${NOAUTH_RELAY}`

      setAppSecretKey(sk)
      setBunkerUri(uri)
      setStatus("awaiting_approval")
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
    }
  }, [])

  // Step 2: Listen for the specific `noauth` response.
  const startListeningAndAwaitApproval = useCallback(async () => {
    if (!appSecretKey) return
    let relay: any
    try {
      const appPublicKey = nostrTools.getPublicKey(appSecretKey)
      relay = nostrTools.relayInit(NOAUTH_RELAY)
      await new Promise((resolve, reject) => {
        relay.on("connect", resolve)
        relay.on("error", reject)
        relay.connect().catch(reject)
        setTimeout(() => reject(new Error("Relay connection timed out")), 7000)
      })

      // Step 3: Use the correct filter.
      const sub = relay.sub([{ kinds: [24133], "#p": [appPublicKey] }])

      const responsePromise = new Promise<BunkerConnectionResult>((resolve, reject) => {
        sub.on("event", async (event: any) => {
          try {
            // Step 4: Decrypt with the CORRECT key (the user's pubkey from the event).
            const userPubkey = event.pubkey
            const sharedSecret = nostrTools.nip04.getSharedSecret(appSecretKey, userPubkey)
            const decryptedContent = await nostrTools.nip04.decrypt(sharedSecret, event.content)
            const response = JSON.parse(decryptedContent)

            // Step 5: Extract the session token.
            if (response.result === "ack") {
              resolve({
                pubkey: userPubkey,
                token: response.params[0], // The session token
                relay: NOAUTH_RELAY,
              })
            } else {
              reject(new Error(response.error || "Connection rejected by signing app."))
            }
          } catch (e) {
            // Silently ignore decryption errors for events not meant for us
          }
        })
      })

      const result = await Promise.race([
        responsePromise,
        new Promise<BunkerConnectionResult>((_, reject) =>
          setTimeout(() => reject(new Error("Approval timed out. Please scan and approve within 2 minutes.")), 120000),
        ),
      ])
      setStatus("success")
      onConnectSuccess(result)
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error.message)
    } finally {
      if (relay) relay.close()
    }
  }, [appSecretKey, onConnectSuccess])

  useEffect(() => {
    generateBunkerUri()
  }, [generateBunkerUri])

  return { status, errorMessage, bunkerUri, startListeningAndAwaitApproval }
}

interface BunkerConnectLogicProps {
  onConnectSuccess: (result: BunkerConnectionResult) => void
  onClose: () => void
}

export default function BunkerConnectLogic({ onConnectSuccess, onClose }: BunkerConnectLogicProps) {
  const { status, errorMessage, bunkerUri, startListeningAndAwaitApproval } = useBunkerConnection({ onConnectSuccess })

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
            <Loader2 className="h-16 w-16 animate-spin" />
            <p>Generating Secure Connection...</p>
          </div>
        )
      case "awaiting_approval":
        return (
          <div>
            <h2 className="text-xl font-bold text-center mb-4">Approve Login</h2>
            <p className="text-center text-sm text-slate-400 mb-4">Scan with a Bunker-compatible app like Nsec.app.</p>
            {/* QR Code */}
            <div className="p-4 bg-white rounded-lg flex items-center justify-center mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bunkerUri)}`}
                alt="Bunker Connection QR Code"
                className="w-48 h-48"
              />
            </div>
            <a
              href={bunkerUri}
              className="block w-full text-center p-3 bg-indigo-600 rounded-lg font-semibold hover:bg-indigo-500"
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
            <h2 className="text-xl font-bold">Connection Successful!</h2>
          </div>
        )
      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
          </div>
        )
      default:
        return null
    }
  }

  return renderContent()
}
