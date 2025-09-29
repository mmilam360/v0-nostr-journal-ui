"use client"
import { useState, useCallback } from "react"
import { QrReader } from "react-qr-reader"
import { generateSecretKey, getPublicKey, nip04, finalizeEvent } from "nostr-tools"
import { SimplePool } from "nostr-tools/pool"
import { Loader2, CheckCircle, AlertTriangle, CameraOff, Wifi, KeyRound, Send } from "lucide-react"

const useNwcConnection = ({ onConnectSuccess }: { onConnectSuccess: (result: any) => void }) => {
  // Expanded states for granular feedback
  const [status, setStatus] = useState("scanning") // scanning, scanned, connecting_relay, encrypting, awaiting_approval, success, error
  const [errorMessage, setErrorMessage] = useState("")
  const [relayUrl, setRelayUrl] = useState("")

  const connectWithUri = useCallback(
    async (nwcUri: string) => {
      let pool: SimplePool | null = null
      try {
        // Step 1: Acknowledge the scan immediately
        setStatus("scanned")
        if (!nwcUri || !nwcUri.startsWith("nostrconnect://")) throw new Error("Invalid QR Code data.")

        const url = new URL(nwcUri)
        const walletPubkey = url.hostname
        const relayUrl = url.searchParams.get("relay")
        setRelayUrl(relayUrl || "")
        if (!walletPubkey || !relayUrl) throw new Error("Invalid NWC URI: Missing pubkey or relay.")

        // Step 2: Connect to the relay
        setStatus("connecting_relay")
        const appSecretKey = generateSecretKey()
        const appPublicKey = getPublicKey(appSecretKey)

        pool = new SimplePool()
        await pool.ensureRelay(relayUrl)

        // Step 3: Encrypt the request
        setStatus("encrypting")
        const connectPayload = { method: "connect", params: [{ name: "Nostr Journal" }] }
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

        const responsePromise = new Promise((resolve, reject) => {
          const sub = pool!.subscribeMany(
            [relayUrl],
            [{ kinds: [24133], authors: [walletPubkey], "#p": [appPublicKey] }],
            {
              onevent: async (event: any) => {
                try {
                  const decrypted = await nip04.decrypt(sharedSecret, event.content)
                  const response = JSON.parse(decrypted)
                  if (response.result_type === "connect") {
                    const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${relayUrl}&secret=${Buffer.from(appSecretKey).toString("hex")}`
                    resolve({ pubkey: walletPubkey, connectionString: persistentConnectionString })
                  } else {
                    reject(new Error(response.error?.message || "Connection rejected."))
                  }
                } catch (e) {
                  // Ignore decryption errors for irrelevant events
                }
              },
            },
          )

          // Clean up subscription after timeout
          setTimeout(() => {
            sub.close()
            reject(new Error("Approval timed out. Please try again."))
          }, 60000)
        })

        // Step 4: Publish and wait for approval
        await pool.publish([relayUrl], requestEvent)
        setStatus("awaiting_approval")
        const result = await responsePromise

        // Step 5: Success!
        setStatus("success")
        onConnectSuccess(result)
      } catch (error: any) {
        setStatus("error")
        setErrorMessage(error.message)
      } finally {
        if (pool) pool.close([relayUrl])
      }
    },
    [onConnectSuccess],
  )

  const reset = useCallback(() => setStatus("scanning"), [])
  return { status, errorMessage, setStatus, handleScanResult: connectWithUri, reset }
}

// The component using the hook.
export default function NwcScannerLogic({
  onConnectSuccess,
  onClose,
}: { onConnectSuccess: (result: any) => void; onClose: () => void }) {
  const { status, errorMessage, setStatus, handleScanResult, reset } = useNwcConnection({ onConnectSuccess })

  const handleQrReaderResult = (result: any) => {
    if (status === "scanning" && result?.text) {
      const scannedData = result.text.trim()
      if (scannedData.startsWith("nostrconnect://")) {
        handleScanResult(scannedData)
      }
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
                onError={(e: any) => {
                  if (e?.name === "NotAllowedError") setStatus("permission_denied")
                }}
                constraints={{ facingMode: "environment" }}
                ViewFinder={() => (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                    <div className="w-60 h-60 border-4 border-dashed border-white/50 rounded-2xl" />
                  </div>
                )}
                className="w-full"
              />
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

      case "scanned":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Loader2 className="h-16 w-16 animate-spin text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Code Detected...</h2>
          </div>
        )
      case "connecting_relay":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Wifi className="h-16 w-16 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Connecting to Relay...</h2>
          </div>
        )
      case "encrypting":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <KeyRound className="h-16 w-16 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Encrypting Request...</h2>
          </div>
        )
      case "awaiting_approval":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Send className="h-16 w-16 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Request Sent!</h2>
            <p className="text-slate-400 text-center">Please approve the connection in your wallet.</p>
          </div>
        )

      // FINAL STATES
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
