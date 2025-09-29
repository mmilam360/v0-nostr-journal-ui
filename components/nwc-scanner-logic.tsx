"use client"
import { useState, useCallback } from "react"
import { QrReader } from "react-qr-reader"
import * as nostrTools from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, CameraOff } from "lucide-react"

const useNwcConnection = ({ onConnectSuccess }: { onConnectSuccess: (result: any) => void }) => {
  const [status, setStatus] = useState("scanning") // 'scanning', 'connecting', 'success', 'error', 'permission_denied'
  const [errorMessage, setErrorMessage] = useState("")
  const [scannedCode, setScannedCode] = useState("[Point camera at a QR code]") // Keep display of scanned code

  const connectWithUri = useCallback(
    async (nwcUri: string) => {
      console.log("[v0] Starting NWC connection with URI:", nwcUri)
      setStatus("connecting")
      let relay: any

      try {
        if (!nwcUri || !nwcUri.startsWith("nostrconnect://")) {
          throw new Error("Invalid QR Code data.")
        }

        // Step 1: Parse the URI
        const url = new URL(nwcUri)
        const walletPubkey = url.hostname
        const relayUrl = url.searchParams.get("relay")
        console.log("[v0] Parsed URI - Wallet pubkey:", walletPubkey, "Relay URL:", relayUrl)

        if (!walletPubkey || !relayUrl) {
          throw new Error("Invalid NWC URI: Missing pubkey or relay.")
        }

        // Step 2: Generate an Identity
        const appSecretKey = nostrTools.generateSecretKey()
        const appPublicKey = nostrTools.getPublicKey(appSecretKey)
        console.log("[v0] Generated app identity - Public key:", appPublicKey)

        // Step 3: Connect to the Meeting Place
        console.log("[v0] Connecting to relay:", relayUrl)
        relay = nostrTools.relayInit(relayUrl)

        await new Promise((resolve, reject) => {
          relay.on("connect", () => {
            console.log("[v0] Relay connected successfully")
            resolve(null)
          })
          relay.on("error", (error: any) => {
            console.log("[v0] Relay connection error:", error)
            reject(error)
          })
          relay.connect().catch(reject)
          setTimeout(() => reject(new Error("Relay connection timed out")), 7000)
        })

        // Step 4 & 5: Craft and Encrypt the Secret Message
        const connectPayload = { method: "connect", params: [{ name: "Nostr Journal" }] }
        console.log("[v0] Creating connect payload:", connectPayload)

        const sharedSecret = nostrTools.nip04.getSharedSecret(appSecretKey, walletPubkey)
        const encryptedPayload = await nostrTools.nip04.encrypt(sharedSecret, JSON.stringify(connectPayload))
        console.log("[v0] Encrypted payload created")

        // Step 6: Send the Message
        const requestEvent = nostrTools.finalizeEvent(
          {
            kind: 24133,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", walletPubkey]],
            content: encryptedPayload,
          },
          appSecretKey,
        )

        console.log("[v0] Request event created:", requestEvent)

        // Step 7: Listen Intently for a Reply
        console.log("[v0] Setting up subscription for wallet response")
        const sub = relay.sub([{ kinds: [24133], authors: [walletPubkey], "#p": [appPublicKey] }])

        const responsePromise = new Promise((resolve, reject) => {
          sub.on("event", async (event: any) => {
            console.log("[v0] Received response event:", event)
            try {
              const decrypted = await nostrTools.nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decrypted)
              console.log("[v0] Decrypted response:", response)

              if (response.result_type === "connect") {
                const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${relayUrl}&secret=${Buffer.from(appSecretKey).toString("hex")}`
                console.log("[v0] Connection successful!")
                resolve({ pubkey: walletPubkey, connectionString: persistentConnectionString })
              } else {
                reject(new Error(response.error?.message || "Connection rejected by wallet."))
              }
            } catch (e) {
              console.log("[v0] Error processing response:", e)
            }
          })
        })

        console.log("[v0] Publishing request event")
        await relay.publish(requestEvent)

        // Step 8: Handle the Reply (or Timeout)
        const result = await Promise.race([
          responsePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection request timed out. Please approve in your wallet.")), 60000),
          ),
        ])

        console.log("[v0] Connection completed successfully:", result)
        setStatus("success")
        onConnectSuccess(result)
      } catch (error: any) {
        console.log("[v0] Connection error:", error)
        setStatus("error")
        setErrorMessage(error.message)
      } finally {
        if (relay) {
          console.log("[v0] Closing relay connection")
          relay.close()
        }
      }
    },
    [onConnectSuccess],
  )

  const reset = useCallback(() => {
    console.log("[v0] Resetting scanner")
    setStatus("scanning")
    setScannedCode("[Point camera at a QR code]")
  }, [])

  return { status, errorMessage, scannedCode, setScannedCode, setStatus, handleScanResult: connectWithUri, reset }
}

export default function NwcScannerLogic({
  onConnectSuccess,
  onClose,
}: { onConnectSuccess: (result: any) => void; onClose: () => void }) {
  const { status, errorMessage, scannedCode, setScannedCode, setStatus, handleScanResult, reset } = useNwcConnection({
    onConnectSuccess,
  })

  const handleQrReaderResult = (result: any) => {
    if (status === "scanning" && result?.text) {
      const scannedData = result.text.trim()
      setScannedCode(scannedData) // Keep displaying the scanned code as requested

      if (scannedData.startsWith("nostrconnect://")) {
        console.log("[v0] Valid NWC URI detected, starting connection")
        handleScanResult(scannedData)
      }
    }
  }

  const handleQrReaderError = (error: any) => {
    console.log("[v0] QR Reader error:", error)
    if (error?.name === "NotAllowedError") {
      setStatus("permission_denied")
    }
  }

  const renderContent = () => {
    switch (status) {
      case "scanning":
        return (
          <div>
            <h2 className="text-xl font-bold text-center mb-4 text-white">Scan to Connect</h2>
            <div className="overflow-hidden rounded-lg bg-black">
              <QrReader
                onResult={handleQrReaderResult}
                onError={handleQrReaderError}
                constraints={{ facingMode: "environment" }}
                ViewFinder={() => (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                    <div className="w-60 h-60 border-4 border-dashed border-white/50 rounded-2xl" />
                  </div>
                )}
                className="w-full"
              />
            </div>
            <div className="mt-4 p-4 rounded-md bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-400">SCANNED CODE:</h3>
              <p
                className={`mt-2 break-words font-mono text-xs ${scannedCode.startsWith("nostrconnect://") ? "text-green-400" : "text-yellow-400"}`}
              >
                {scannedCode}
              </p>
            </div>
          </div>
        )

      case "permission_denied":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <CameraOff className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Camera Access Denied</h2>
            <p className="text-slate-400">Please enable camera permissions.</p>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
            >
              Try Again
            </button>
          </div>
        )

      case "connecting":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Loader2 className="h-16 w-16 animate-spin text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Connecting...</h2>
            <p className="text-slate-400 text-center">Please approve the connection in your wallet.</p>
            <div className="mt-4 p-3 rounded-md bg-slate-900 max-w-xs">
              <p className="text-green-400 font-mono text-xs break-all">{scannedCode}</p>
            </div>
          </div>
        )

      case "success":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <CheckCircle className="h-16 w-16 text-green-400" />
            <h2 className="text-xl font-bold text-white">Connection Successful!</h2>
          </div>
        )

      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
            >
              Scan Again
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return renderContent()
}
