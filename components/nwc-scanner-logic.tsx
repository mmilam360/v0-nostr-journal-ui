"use client"
import { useState, useCallback } from "react"
import { QrReader } from "react-qr-reader"
import { generateSecretKey, getPublicKey, relayInit, nip04, finalizeEvent } from "nostr-tools"
import { Loader2, CheckCircle, AlertTriangle, CameraOff } from "lucide-react"

const useNwcConnection = ({ onConnectSuccess }: { onConnectSuccess: (result: any) => void }) => {
  const [status, setStatus] = useState("scanning")
  const [errorMessage, setErrorMessage] = useState("")

  const connectWithUri = useCallback(
    async (nwcUri: string) => {
      setStatus("connecting")
      let relay: any
      try {
        if (!nwcUri || !nwcUri.startsWith("nostrconnect://")) {
          throw new Error("Invalid QR Code. Please scan a Nostr Wallet Connect code.")
        }
        const url = new URL(nwcUri)
        const walletPubkey = url.hostname
        const relayUrl = url.searchParams.get("relay")
        if (!walletPubkey || !relayUrl) throw new Error("Invalid NWC URI: Missing pubkey or relay.")

        const appSecretKey = generateSecretKey()
        const appPublicKey = getPublicKey(appSecretKey)

        relay = relayInit(relayUrl)
        await new Promise((resolve, reject) => {
          relay.on("connect", resolve)
          relay.on("error", reject)
          relay.connect().catch(reject)
          setTimeout(() => reject(new Error("Relay connection timed out")), 7000)
        })

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

        const sub = relay.sub([{ kinds: [24133], authors: [walletPubkey], "#p": [appPublicKey] }])
        const responsePromise = new Promise((resolve, reject) => {
          sub.on("event", async (event: any) => {
            try {
              const decrypted = await nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decrypted)
              if (response.result_type === "connect") {
                const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${relayUrl}&secret=${Buffer.from(appSecretKey).toString("hex")}`
                resolve({ pubkey: walletPubkey, connectionString: persistentConnectionString })
              } else {
                reject(new Error(response.error?.message || "Connection rejected by wallet."))
              }
            } catch (e) {}
          })
        })

        await relay.publish(requestEvent)
        const result = await Promise.race([
          responsePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection request timed out. Please approve in your wallet.")), 60000),
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
    },
    [onConnectSuccess],
  )

  const reset = useCallback(() => setStatus("scanning"), [])
  return { status, errorMessage, setStatus, handleScanResult: connectWithUri, reset }
}

export default function NwcScannerLogic({
  onConnectSuccess,
  onClose,
}: { onConnectSuccess: (result: any) => void; onClose: () => void }) {
  const { status, errorMessage, setStatus, handleScanResult, reset } = useNwcConnection({ onConnectSuccess })

  switch (status) {
    case "scanning":
      return (
        <div>
          <h2 className="text-xl font-bold text-center mb-4 text-white">Scan to Connect</h2>
          <div className="overflow-hidden rounded-lg bg-black">
            <QrReader
              onResult={(result) => {
                if (result && result.text) {
                  handleScanResult(result.text)
                }
              }}
              onError={(error) => {
                if (error?.name === "NotAllowedError") setStatus("permission_denied")
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
          <p className="text-slate-400">Please enable camera permissions to continue.</p>
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
