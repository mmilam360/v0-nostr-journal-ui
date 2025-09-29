"use client"

import { useState, useCallback } from "react"
import { QrReader } from "react-qr-reader"
import { getPublicKey, finalizeEvent, nip04 } from "nostr-tools"
import { SimplePool } from "nostr-tools/pool"
import { Loader2, CheckCircle, AlertTriangle, CameraOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// This is the core logic for the NWC connection, wrapped in a React Hook for clarity.
const useNwcConnection = ({ onConnectSuccess }: { onConnectSuccess: (result: any) => void }) => {
  const [status, setStatus] = useState("scanning") // scanning, connecting, success, error, permission_denied
  const [errorMessage, setErrorMessage] = useState("")

  const connectWithUri = useCallback(
    async (nwcUri: string) => {
      setStatus("connecting")
      let pool: SimplePool | null = null

      try {
        console.log("[v0] Processing QR code:", nwcUri)

        let processedUri = nwcUri

        // Handle Alby Hub Connection Secret format (nostr+walletconnect://)
        if (nwcUri.startsWith("nostr+walletconnect://")) {
          processedUri = nwcUri.replace("nostr+walletconnect://", "nostrconnect://")
          console.log("[v0] Converted Alby Hub format to standard NWC format:", processedUri)
        }

        // Validate the URI format
        if (!processedUri.startsWith("nostrconnect://")) {
          throw new Error(
            `Invalid QR Code. Expected NWC format (nostrconnect://) or Alby Hub format (nostr+walletconnect://), but got: ${nwcUri.substring(0, 50)}...`,
          )
        }

        const url = new URL(processedUri)
        const walletPubkey = url.hostname
        const relayUrl = url.searchParams.get("relay")
        const secret = url.searchParams.get("secret")

        console.log("[v0] Parsed wallet pubkey:", walletPubkey)
        console.log("[v0] Parsed relay URL:", relayUrl)
        console.log("[v0] Has secret:", !!secret)

        if (!walletPubkey || !relayUrl || !secret) {
          throw new Error("Invalid NWC URI - missing wallet pubkey, relay URL, or secret")
        }

        const appSecretKey = new Uint8Array(Buffer.from(secret, "hex"))
        const appPublicKey = getPublicKey(appSecretKey)
        console.log("[v0] Using Connection Secret (traditional flow)")

        pool = new SimplePool()
        const relays = [relayUrl]

        console.log("[v0] Checking wallet info...")
        const infoEvents = await pool.querySync(relays, { kinds: [13194], authors: [walletPubkey] })

        if (infoEvents.length === 0) {
          throw new Error("Wallet not found on relay. Please ensure your wallet is online.")
        }

        console.log("[v0] Wallet info found, testing connection...")

        const getInfoPayload = {
          method: "get_info",
          params: {},
        }

        console.log("[v0] Encrypting get_info payload...")
        const encryptedPayload = await nip04.encrypt(appSecretKey, walletPubkey, JSON.stringify(getInfoPayload))

        const requestEvent = finalizeEvent(
          {
            kind: 23194,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", walletPubkey]],
            content: encryptedPayload,
          },
          appSecretKey,
        )

        console.log("[v0] Publishing get_info request...")

        const responsePromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Connection test timed out. Please ensure your wallet is online and accessible."))
          }, 30000) // 30 second timeout for get_info

          const sub = pool!.subscribeMany(relays, [{ kinds: [23195], authors: [walletPubkey], "#p": [appPublicKey] }], {
            async onevent(event) {
              try {
                console.log("[v0] Received wallet response event")
                const decrypted = await nip04.decrypt(appSecretKey, walletPubkey, event.content)
                const response = JSON.parse(decrypted)

                console.log("[v0] Decrypted response:", response)
                console.log("[v0] Response keys:", Object.keys(response))
                if (response.result) {
                  console.log("[v0] Result keys:", Object.keys(response.result))
                  console.log("[v0] Full result object:", JSON.stringify(response.result, null, 2))
                }

                if (response.result) {
                  clearTimeout(timeout)
                  sub.close()

                  const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${encodeURIComponent(relayUrl)}&secret=${secret}`

                  console.log("[v0] Connection test successful! Wallet info:", response.result)
                  resolve({
                    pubkey: walletPubkey,
                    connectionString: persistentConnectionString,
                    walletInfo: response.result,
                  })
                } else if (response.error) {
                  clearTimeout(timeout)
                  sub.close()
                  console.log("[v0] Wallet returned error:", response.error)
                  reject(new Error(response.error.message || "Connection rejected by wallet"))
                } else {
                  console.log("[v0] Unexpected response format - no result or error field")
                  console.log("[v0] Full response:", JSON.stringify(response, null, 2))
                }
              } catch (e) {
                console.error("[v0] Error processing wallet response:", e)
                clearTimeout(timeout)
                sub.close()
                reject(new Error("Failed to process wallet response"))
              }
            },
            oneose() {
              console.log("[v0] Subscription established, waiting for wallet response...")
            },
          })
        })

        // Publish the request
        await pool.publish(relays, requestEvent)
        console.log("[v0] Connection test request published, waiting for response...")

        // Wait for response
        const result = await responsePromise

        setStatus("success")
        onConnectSuccess(result)
      } catch (error) {
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Connection failed")
        console.error("[v0] Connection error:", error)
      } finally {
        if (pool) {
          pool.close([])
        }
      }
    },
    [onConnectSuccess],
  )

  const reset = () => {
    setStatus("scanning")
    setErrorMessage("")
  }

  return { status, errorMessage, connectWithUri, setStatus, reset }
}

interface NwcConnectionManagerProps {
  onConnectSuccess: (result: { pubkey: string; connectionString: string; walletInfo?: any }) => void
  onClose: () => void
}

export default function NwcConnectionManager({ onConnectSuccess, onClose }: NwcConnectionManagerProps) {
  const { status, errorMessage, connectWithUri, setStatus, reset } = useNwcConnection({ onConnectSuccess })

  const handleQrResult = (result: any, error: any) => {
    if (result) {
      console.log("[v0] QR code scanned:", result.text)
      connectWithUri(result.text)
    }
    if (error) {
      console.error("[v0] QR scan error:", error)
      if (error.name === "NotAllowedError" || error.message?.includes("permission")) {
        setStatus("permission_denied")
      }
    }
  }

  const renderContent = () => {
    switch (status) {
      case "scanning":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white mb-6">Scan to Connect</h2>

            <div className="relative bg-black rounded-lg overflow-hidden mx-auto w-80 h-80 mb-4">
              <QrReader
                onResult={handleQrResult}
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
            <Button onClick={reset} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2">
              Try Again
            </Button>
          </div>
        )

      case "connecting":
        return (
          <div className="text-center py-12">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">Connecting to Wallet...</h2>
            <p className="text-slate-400 max-w-sm mx-auto">
              Please check your wallet app and ensure it is online and accessible.
            </p>
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
            <Button onClick={reset} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2">
              Scan Again
            </Button>
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
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
          <X className="w-6 h-6" />
        </button>

        {renderContent()}
      </div>
    </div>
  )
}
