"use client"
import { useState, useCallback } from "react"
import { QrReader } from "react-qr-reader"
import * as nostrTools from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, CameraOff, X } from "lucide-react"

// This is the core logic that powers the component.
const useNwcConnection = ({ onConnectSuccess }: { onConnectSuccess: (result: any) => void }) => {
  const [status, setStatus] = useState("scanning") // 'scanning', 'connecting', 'success', 'error', 'permission_denied'
  const [errorMessage, setErrorMessage] = useState("")

  const connectWithUri = useCallback(
    async (nwcUri: string) => {
      setStatus("connecting")
      let relay: any = null // Using relay instead of SimplePool for compatibility
      try {
        console.log("[v0] Processing QR code:", nwcUri)

        // Handle different URI formats
        let processedUri = nwcUri
        if (nwcUri.startsWith("nostr+walletconnect://")) {
          processedUri = nwcUri.replace("nostr+walletconnect://", "nostrconnect://")
          console.log("[v0] Converted Alby Hub format to standard NWC format:", processedUri)
        }

        if (!processedUri.startsWith("nostrconnect://")) {
          throw new Error("Invalid QR Code. Please scan a Nostr Wallet Connect code.")
        }

        // 1. Parse URI for wallet's pubkey and relay
        const url = new URL(processedUri)
        const walletPubkey = url.hostname
        const relayUrl = url.searchParams.get("relay")

        console.log("[v0] Parsed wallet pubkey:", walletPubkey)
        console.log("[v0] Parsed relay URL:", relayUrl)

        if (!walletPubkey || !relayUrl) throw new Error("Invalid NWC URI - missing wallet pubkey or relay URL")

        const appSecretKey = nostrTools.generateSecretKey()
        const appPublicKey = nostrTools.getPublicKey(appSecretKey)
        console.log("[v0] Generated app keypair for connection")

        relay = nostrTools.relayInit(relayUrl)
        console.log("[v0] Connecting to relay:", relayUrl)

        // Connect to relay with timeout
        await new Promise((resolve, reject) => {
          relay.on("connect", resolve)
          relay.on("error", reject)
          relay.connect().catch(reject)
          setTimeout(() => reject(new Error("Relay connection timed out")), 5000)
        })

        // 4. Create and encrypt the permission request (NIP-04)
        const connectPayload = { method: "connect", params: [{ name: "Nostr Journal" }] }
        console.log("[v0] Creating connection request payload")

        const sharedSecret = nostrTools.nip04.getSharedSecret(appSecretKey, walletPubkey)
        const encryptedPayload = await nostrTools.nip04.encrypt(sharedSecret, JSON.stringify(connectPayload))

        const requestEvent = nostrTools.finalizeEvent(
          {
            kind: 24133,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", walletPubkey]],
            content: encryptedPayload,
          },
          appSecretKey,
        )

        console.log("[v0] Created and encrypted connection request event")

        // 5. Subscribe to the response
        const sub = relay.sub([{ kinds: [24133], authors: [walletPubkey], "#p": [appPublicKey] }])
        const responsePromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Connection request timed out. Please approve in your wallet."))
          }, 60000)

          sub.on("event", async (event: any) => {
            try {
              console.log("[v0] Received wallet response event")
              const decrypted = await nostrTools.nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decrypted)

              console.log("[v0] Decrypted response:", response)

              if (response.result_type === "connect") {
                clearTimeout(timeout)
                const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${encodeURIComponent(relayUrl)}&secret=${Buffer.from(appSecretKey).toString("hex")}`
                console.log("[v0] Connection approved by wallet")
                resolve({ pubkey: walletPubkey, connectionString: persistentConnectionString })
              } else {
                clearTimeout(timeout)
                reject(new Error(response.error?.message || "Connection rejected by wallet."))
              }
            } catch (e) {
              console.log("[v0] Ignoring decryption error from unrelated event:", e)
              /* Ignore decryption errors from unrelated events */
            }
          })
        })

        // 6. Publish the request
        console.log("[v0] Publishing connection request...")
        await relay.publish(requestEvent)

        const result = await responsePromise

        // 7. If we get here, it was successful!
        console.log("[v0] Connection successful!")
        setStatus("success")
        onConnectSuccess(result)
      } catch (error) {
        console.error("[v0] Connection error:", error)
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
      } finally {
        // 8. Clean up the connection
        if (relay) {
          console.log("[v0] Closing relay connection")
          relay.close()
        }
      }
    },
    [onConnectSuccess],
  )

  const reset = useCallback(() => {
    setStatus("scanning")
    setErrorMessage("")
  }, [])

  return { status, errorMessage, setStatus, handleScanResult: connectWithUri, reset }
}

interface NwcConnectionManagerProps {
  onConnectSuccess: (result: { pubkey: string; connectionString: string }) => void
  onClose: () => void
}

function NwcConnectionManager({ onConnectSuccess, onClose }: NwcConnectionManagerProps) {
  const { status, errorMessage, setStatus, handleScanResult, reset } = useNwcConnection({ onConnectSuccess })

  const renderContent = () => {
    switch (status) {
      case "scanning":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white mb-6">Scan to Connect</h2>
            <div className="relative bg-black rounded-lg overflow-hidden mx-auto w-80 h-80 mb-4">
              <QrReader
                onResult={(result) => {
                  if (result) {
                    console.log("[v0] QR code scanned:", result.text)
                    handleScanResult(result.text)
                  }
                }}
                onError={(error) => {
                  console.error("[v0] QR scan error:", error)
                  if (error.name === "NotAllowedError" || error.name === "NotFoundError") {
                    setStatus("permission_denied")
                  }
                }}
                constraints={{ facingMode: "environment" }}
                className="w-full h-full"
              />
              {/* Visual Guide - Square viewfinder overlay */}
              <div className="absolute inset-4 border-2 border-white/50 rounded-lg pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
              </div>
            </div>
            <p className="text-slate-400 text-sm">Position the QR code within the frame</p>
          </div>
        )
      case "permission_denied":
        return (
          <div className="text-center py-12">
            <CameraOff className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">Camera Access Denied</h2>
            <p className="text-slate-400 mb-6 max-w-sm mx-auto">
              Please enable camera permissions in your browser's settings to continue.
            </p>
            <button onClick={reset} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md">
              Try Again
            </button>
          </div>
        )
      case "connecting":
        return (
          <div className="text-center py-12">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">Connecting to Wallet...</h2>
            <p className="text-slate-400 max-w-sm mx-auto">Please approve the connection in your wallet app.</p>
          </div>
        )
      case "success":
        return (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6 animate-bounce" />
            <h2 className="text-2xl font-semibold text-white">Connection Successful!</h2>
          </div>
        )
      case "error":
        return (
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">Connection Failed</h2>
            <p className="text-slate-400 mb-6 max-w-sm mx-auto">{errorMessage}</p>
            <button onClick={reset} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md">
              Scan Again
            </button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md relative">
        {/* Close button */}
        {status !== "success" && (
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
            <X className="w-6 h-6" />
          </button>
        )}
        {renderContent()}
      </div>
    </div>
  )
}

export { NwcConnectionManager }
export default NwcConnectionManager
