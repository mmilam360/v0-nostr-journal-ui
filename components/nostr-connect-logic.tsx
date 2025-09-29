"use client"
import { useState, useCallback, useEffect } from "react"
import { Connect } from "@nostr-connect/connect"
import { generateSecretKey, getPublicKey } from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

const NWC_RELAYS = ["wss://relay.getalby.com/v1", "wss://relay.damus.io", "wss://nostr.mutinywallet.com"]

const useNostrConnect = ({ onConnectSuccess }: { onConnectSuccess: (result: { pubkey: string }) => void }) => {
  const [status, setStatus] = useState("generating")
  const [errorMessage, setErrorMessage] = useState("")
  const [connectUri, setConnectUri] = useState("")
  const [connectInstance, setConnectInstance] = useState<Connect | null>(null)

  const initializeConnection = useCallback(async () => {
    try {
      console.log("[v0] Initializing Nostr Connect with professional library...")

      // Generate ephemeral key for this session
      const sk = generateSecretKey()
      const pk = getPublicKey(sk)

      console.log("[v0] App public key:", pk)

      // Create Connect instance with the relay
      const connect = new Connect({
        secretKey: sk,
        relay: NWC_RELAYS[0],
      })

      // Set up event listener for successful connection
      connect.events.on("connect", (walletPubkey: string) => {
        console.log("[v0] Connection successful! Wallet pubkey:", walletPubkey)
        setStatus("success")
        onConnectSuccess({ pubkey: walletPubkey })
      })

      // Set up error handler
      connect.events.on("disconnect", () => {
        console.log("[v0] Connection disconnected")
      })

      // Initialize the connection
      await connect.init()

      console.log("[v0] Connect instance initialized")

      // Generate the connection URI
      const metadata = {
        name: "Nostr Journal",
        url: "https://nostrjournal.app",
      }

      const uri = connect.generateConnectURI(metadata)

      console.log("[v0] Generated ConnectURI:", uri.substring(0, 50) + "...")

      setConnectInstance(connect)
      setConnectUri(uri)
      setStatus("awaiting_approval")

      // Set up timeout for approval
      setTimeout(() => {
        if (status === "awaiting_approval") {
          console.log("[v0] Approval timeout reached")
          setStatus("error")
          setErrorMessage("Approval timed out. Please scan and approve within 2 minutes.")
          connect.disconnect()
        }
      }, 120000)
    } catch (error) {
      console.error("[v0] Failed to initialize connection:", error)
      setStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize secure connection")
    }
  }, [onConnectSuccess, status])

  useEffect(() => {
    initializeConnection()

    // Cleanup on unmount
    return () => {
      if (connectInstance) {
        connectInstance.disconnect()
      }
    }
  }, [])

  return { status, errorMessage, connectUri }
}

interface NostrConnectLogicProps {
  onConnectSuccess: (result: { pubkey: string }) => void
  onClose: () => void
}

export default function NostrConnectLogic({ onConnectSuccess, onClose }: NostrConnectLogicProps) {
  const { status, errorMessage, connectUri } = useNostrConnect({ onConnectSuccess })

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
