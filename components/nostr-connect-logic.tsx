"use client"
import { useState, useCallback, useEffect } from "react"
import { generateSecretKey, getPublicKey, relayInit, nip04 } from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, Send, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

const useNostrConnect = ({ onConnectSuccess }: { onConnectSuccess: (result: { pubkey: string }) => void }) => {
  const [status, setStatus] = useState("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [connectUri, setConnectUri] = useState("")
  const [appSecretKey, setAppSecretKey] = useState<Uint8Array | null>(null)

  const generateConnectUri = useCallback(() => {
    try {
      const secretKey = generateSecretKey()
      const appPublicKey = getPublicKey(secretKey)
      const relay = "wss://relay.nsec.app" // Use nsec.app relay for better compatibility
      const uri = `nostrconnect://${appPublicKey}?relay=${relay}&metadata=${JSON.stringify({ name: "Nostr Journal" })}`
      setConnectUri(uri)
      setAppSecretKey(secretKey)
      setStatus("awaiting_scan")
      return secretKey
    } catch (e) {
      setStatus("error")
      setErrorMessage("Failed to generate connection key.")
      return null
    }
  }, [])

  const listenForApproval = useCallback(
    async (secretKey: Uint8Array) => {
      if (!secretKey) return
      setStatus("awaiting_approval")
      let relay
      try {
        const appPublicKey = getPublicKey(secretKey)
        relay = relayInit("wss://relay.nsec.app")

        // Connect to relay with timeout
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
              const sharedSecret = nip04.getSharedSecret(secretKey, event.pubkey)
              const decrypted = await nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decrypted)

              if (response.result === "auth_url") {
                // This is an advanced NWC feature, for now we treat this as a success with the pubkey
                resolve({ pubkey: event.pubkey })
              } else if (response.result === true || response.result_type === "connect") {
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
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Approval timed out after 2 minutes.")), 120000),
          ),
        ])

        setStatus("success")
        onConnectSuccess(result)
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
      } finally {
        if (relay) relay.close()
      }
    },
    [onConnectSuccess],
  )

  useEffect(() => {
    generateConnectUri()
  }, [generateConnectUri])

  return { status, errorMessage, connectUri, listenForApproval, appSecretKey }
}

interface NostrConnectLogicProps {
  onConnectSuccess: (result: { pubkey: string }) => void
  onClose: () => void
}

export default function NostrConnectLogic({ onConnectSuccess, onClose }: NostrConnectLogicProps) {
  const { status, errorMessage, connectUri, listenForApproval, appSecretKey } = useNostrConnect({ onConnectSuccess })

  const handleOpenInApp = () => {
    // Start listening for approval when user opens the app
    if (appSecretKey) {
      listenForApproval(appSecretKey)
    }

    // Try to open in nsec.app
    const nsecAppUrl = `https://nsec.app/bunker?connection=${encodeURIComponent(connectUri)}`
    window.open(nsecAppUrl, "_blank")
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

      case "awaiting_scan":
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-2">Connect with Signing App</h2>
              <p className="text-sm text-slate-400">
                Scan with a signing app like Nsec.app to connect your account securely.
              </p>
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
            <Button onClick={handleOpenInApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Nsec.app
            </Button>

            {/* Instructions */}
            <div className="bg-slate-700/50 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Instructions:</h4>
              <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                <li>Scan the QR code with your signing app</li>
                <li>Or click "Open in Nsec.app" to connect directly</li>
                <li>Approve the connection request in your signing app</li>
                <li>Wait for the connection to be established</li>
              </ol>
            </div>
          </div>
        )

      case "awaiting_approval":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Send className="h-16 w-16 text-blue-500" />
            <h2 className="text-xl font-bold text-white">Request Sent!</h2>
            <p className="text-slate-400 text-center">Please approve the connection in your signing app.</p>
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Waiting for approval...</span>
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
