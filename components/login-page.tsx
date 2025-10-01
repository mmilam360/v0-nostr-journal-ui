"use client"

import { useState, useCallback } from "react"
import { NostrFetcher } from "nostr-fetch"
import { generateSecretKey, getPublicKey, nip04 } from "nostr-tools"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { AuthData } from "@/components/main-app"

const NOAUTH_RELAY = "wss://relay.nostr.band"

type LoginStatus = "idle" | "generating" | "awaiting_approval" | "success" | "error"

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [bunkerUri, setBunkerUri] = useState("")
  const [userPubkey, setUserPubkey] = useState("")
  const { toast } = useToast()

  const startLoginProcess = useCallback(async () => {
    setLoginStatus("generating")
    let fetcher: NostrFetcher | null = null
    let successful = false

    try {
      // Step 1: Generate the bunker:// URI
      const appSecretKey = generateSecretKey()
      const appPublicKey = getPublicKey(appSecretKey)
      const uri = `bunker://${appPublicKey}?relay=${NOAUTH_RELAY}`

      console.log("[v0] 🚀 Starting bunker connection...")
      console.log("[v0] 📱 Bunker URI:", uri)

      setBunkerUri(uri)
      setLoginStatus("awaiting_approval")

      // Step 2: Initialize nostr-fetch
      console.log("[v0] 🔌 Initializing nostr-fetch...")
      fetcher = NostrFetcher.init()

      // Step 3: Create a live subscription using allEventsIterator
      console.log("[v0] 📡 Subscribing to relay:", NOAUTH_RELAY)
      const sub = fetcher.allEventsIterator(
        [NOAUTH_RELAY],
        { kinds: [24133] },
        { "#p": [appPublicKey] },
        { realTime: true, timeout: 120000 },
      )

      console.log("[v0] 🔍 Waiting for approval event...")

      // Step 4: Listen for the approval event
      for await (const event of sub) {
        try {
          console.log("[v0] 📨 Received event from:", event.pubkey)

          const remotePubkey = event.pubkey
          const sharedSecret = nip04.getSharedSecret(appSecretKey, remotePubkey)
          const decryptedContent = await nip04.decrypt(sharedSecret, event.content)

          console.log("[v0] ✅ Decryption successful!")

          const response = JSON.parse(decryptedContent)
          console.log("[v0] 📦 Response:", response)

          if (response.result === "ack") {
            console.log("[v0] ✅ CONNECTION SUCCESSFUL!")
            console.log("[v0] 👤 User pubkey:", remotePubkey)

            successful = true
            setLoginStatus("success")
            setUserPubkey(remotePubkey)

            const authData: AuthData = {
              pubkey: remotePubkey,
              authMethod: "nwc",
            }

            toast({
              title: "Connected successfully",
              description: "Your signing app is now connected",
            })

            // Give the success UI a moment to show before transitioning
            setTimeout(() => {
              onLoginSuccess(authData)
            }, 1000)

            break
          } else if (response.error) {
            console.error("[v0] ❌ Remote signer returned error:", response.error)
            throw new Error(response.error)
          }
        } catch (e) {
          console.log("[v0] ⚠️ Could not decrypt event (likely not for us):", e instanceof Error ? e.message : String(e))
        }
      }

      if (!successful) {
        throw new Error("Approval timed out after 2 minutes. Please try again.")
      }
    } catch (error) {
      console.error("[v0] ❌ Connection error:", error)
      setLoginStatus("error")
      setErrorMessage(error instanceof Error ? error.message : "Connection failed")
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      })
    } finally {
      if (fetcher) {
        console.log("[v0] 🧹 Cleaning up connection...")
        fetcher.shutdown()
      }
    }
  }, [onLoginSuccess, toast])

  const handleOpenSignerClick = () => {
    if (bunkerUri) {
      window.location.href = bunkerUri
    }
  }

  const handleDemoMode = () => {
    console.log("[v0] 🎭 Starting demo mode...")

    // Generate a fake keypair for demo purposes
    const demoSecretKey = generateSecretKey()
    const demoPubkey = getPublicKey(demoSecretKey)

    const demoAuthData: AuthData = {
      pubkey: demoPubkey,
      authMethod: "extension", // Use extension as the auth method for demo
    }

    toast({
      title: "Demo Mode Active",
      description: "You're using a temporary demo account. Your notes won't be synced.",
    })

    onLoginSuccess(demoAuthData)
  }

  const renderLoginContent = () => {
    switch (loginStatus) {
      case "idle":
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-white">Nostr Journal</h1>
              <p className="text-slate-400 text-lg">Your private, sovereign notes</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={startLoginProcess}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg shadow-lg hover:shadow-xl"
              >
                Connect with Signing App
              </button>
              <p className="text-xs text-slate-500">
                Compatible with Nsec.app, Amber, and other bunker-compatible signers
              </p>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-800 px-2 text-slate-500">Or</span>
                </div>
              </div>

              <button
                onClick={handleDemoMode}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-3 px-6 rounded-lg transition-colors border border-slate-600"
              >
                Try Demo Mode
              </button>
              <p className="text-xs text-slate-500">Test the app without a signing app (notes won't be synced)</p>
            </div>
          </div>
        )

      case "generating":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-80">
            <Loader2 className="h-16 w-16 animate-spin text-indigo-500" />
            <p className="text-slate-300 text-lg">Generating Secure Connection...</p>
          </div>
        )

      case "awaiting_approval":
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Approve Login</h2>
              <p className="text-slate-400">Scan with a bunker-compatible app to connect</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <p className="text-sm text-blue-200 font-semibold mb-2">How to connect:</p>
              <ol className="text-xs text-blue-300 space-y-1.5 list-decimal list-inside">
                <li>Open Nsec.app, Amber, or another bunker-compatible app</li>
                <li>Scan the QR code below or click "Open in Signing App"</li>
                <li>Approve the connection request in your app</li>
              </ol>
            </div>

            <div className="p-6 bg-white rounded-xl flex items-center justify-center">
              <QRCodeSVG value={bunkerUri} size={280} level="M" />
            </div>

            <button
              onClick={handleOpenSignerClick}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Open in Signing App
            </button>

            <div className="flex items-center justify-center space-x-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Waiting for approval (2 min timeout)...</span>
            </div>

            <details className="mt-4">
              <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                Show connection URI
              </summary>
              <div className="mt-2 p-3 bg-slate-900 rounded-lg text-xs font-mono break-all text-slate-300">
                {bunkerUri}
              </div>
            </details>
          </div>
        )

      case "success":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-80 text-center">
            <CheckCircle className="h-20 w-20 text-green-400" />
            <h2 className="text-2xl font-bold text-white">Connection Successful!</h2>
            <p className="text-slate-400">Loading your journal...</p>
            {userPubkey && (
              <p className="text-xs text-slate-400 font-mono break-all bg-slate-900 p-3 rounded-lg max-w-sm">
                {userPubkey}
              </p>
            )}
          </div>
        )

      case "error":
        return (
          <div className="space-y-6 text-center">
            <div className="flex flex-col items-center space-y-3">
              <AlertTriangle className="h-16 w-16 text-red-400" />
              <h2 className="text-2xl font-bold text-white">Connection Failed</h2>
              <p className="text-slate-400 max-w-sm">{errorMessage}</p>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 text-left">
              <p className="text-sm text-slate-300 font-semibold mb-2">Troubleshooting:</p>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                <li>Make sure you scanned the QR code with a compatible app</li>
                <li>Check that your signing app is connected to the internet</li>
                <li>Try using Nsec.app or Amber</li>
                <li>Make sure you approved the connection in your app</li>
              </ul>
            </div>

            <button
              onClick={startLoginProcess}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-slate-800 p-8 shadow-2xl border border-slate-700">
      {renderLoginContent()}
    </div>
  )
}
