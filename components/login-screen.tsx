"use client"

import { useState, useEffect } from "react"
import { Zap, Key, QrCode, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { nip19, getPublicKey } from "nostr-tools"
import NwcConnectionManager from "./nwc-connection-manager"

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "nwc"
  privateKey?: string // Only for nsec login
  nwcUri?: string // Only for NWC login
}

interface LoginScreenProps {
  onLogin: (authData: AuthData) => void
}

type LoginState = "initial" | "connecting"

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [loginState, setLoginState] = useState<LoginState>("initial")
  const [showNsecModal, setShowNsecModal] = useState(false)
  const [nsecInput, setNsecInput] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState("")
  const [showNwcModal, setShowNwcModal] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualInput, setManualInput] = useState("")

  useEffect(() => {
    const checkExistingSession = () => {
      const savedNwcUri = localStorage.getItem("nostr-journal-nwc-uri")
      if (savedNwcUri) {
        console.log("[v0] Found existing NWC session, attempting to restore...")
        try {
          // Extract pubkey from NWC URI
          const url = new URL(savedNwcUri)
          const pubkey = url.pathname.replace("//", "")

          onLogin({
            pubkey,
            authMethod: "nwc",
            nwcUri: savedNwcUri,
          })
        } catch (error) {
          console.error("[v0] Failed to restore NWC session:", error)
          localStorage.removeItem("nostr-journal-nwc-uri")
        }
      }
    }

    checkExistingSession()
  }, [onLogin])

  const handleBrowserWalletLogin = async () => {
    setIsConnecting(true)
    setError("")

    try {
      // Check if window.nostr exists (browser extension like Alby Hub)
      if (typeof window !== "undefined" && (window as any).nostr) {
        console.log("[v0] Found Nostr browser extension")
        const pubkey = await (window as any).nostr.getPublicKey()
        console.log("[v0] Got public key:", pubkey)

        onLogin({
          pubkey,
          authMethod: "extension",
        })
      } else {
        setError("No Nostr browser extension found. Please install Alby Hub or another Nostr extension.")
      }
    } catch (err) {
      console.log("[v0] Browser wallet connection error:", err)
      setError("Failed to connect to browser wallet. Please try again.")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleNWCConnect = () => {
    setError("")
    setShowNwcModal(true)
  }

  const handleNwcConnectionSuccess = (result: { pubkey: string; connectionString: string }) => {
    console.log("[v0] NWC connection successful:", result.pubkey)

    // Save the connection string for persistent sessions
    localStorage.setItem("nostr-journal-nwc-uri", result.connectionString)

    setShowNwcModal(false)

    onLogin({
      pubkey: result.pubkey,
      authMethod: "nwc",
      nwcUri: result.connectionString,
    })
  }

  const handleNwcModalClose = () => {
    setShowNwcModal(false)
    setError("")
  }

  const handleNsecLogin = async () => {
    console.log("[v0] handleNsecLogin called with input:", nsecInput ? "present" : "empty")

    if (!nsecInput.trim()) {
      setError("Please enter your nsec key")
      return
    }

    setIsConnecting(true)
    setError("")

    try {
      console.log("[v0] Attempting nsec login with input:", nsecInput.slice(0, 10) + "...")

      if (!nsecInput.startsWith("nsec1")) {
        throw new Error("Invalid nsec format. Should start with 'nsec1'")
      }

      const { type, data } = nip19.decode(nsecInput.trim())
      console.log("[v0] Decoded nsec type:", type)

      if (type !== "nsec") {
        throw new Error("Invalid nsec format. Should start with 'nsec1'")
      }

      // Convert the decoded data to hex string
      const privateKeyHex = Array.from(data as Uint8Array, (byte) => byte.toString(16).padStart(2, "0")).join("")
      console.log("[v0] Private key hex length:", privateKeyHex.length)

      // Derive public key from private key using nostr-tools
      const pubkeyHex = getPublicKey(data as Uint8Array)
      console.log("[v0] Successfully derived public key from nsec:", pubkeyHex)

      // Clear the nsec input for security
      setNsecInput("")
      setShowNsecModal(false)

      console.log("[v0] Calling onLogin with pubkey:", pubkeyHex)
      onLogin({
        pubkey: pubkeyHex,
        authMethod: "nsec",
        privateKey: privateKeyHex,
      })
    } catch (err) {
      console.error("[v0] nsec login error:", err)
      const errorMessage =
        err instanceof Error ? err.message : "Invalid nsec key. Please check the format and try again."
      setError(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleBack = () => {
    setLoginState("initial")
    setError("")
    setShowManualInput(false)
    setManualInput("")
  }

  const renderLoginContent = () => {
    switch (loginState) {
      case "initial":
        return (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Button
                onClick={handleBrowserWalletLogin}
                disabled={isConnecting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-lg py-3 flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                {isConnecting ? "Connecting..." : "Login with Browser Extension"}
              </Button>

              <Button
                onClick={handleNWCConnect}
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 rounded-lg py-3 flex items-center justify-center gap-2 bg-transparent"
              >
                <QrCode className="w-5 h-5" />
                Connect a Remote Wallet (NWC)
              </Button>

              <Button
                onClick={() => setShowNsecModal(true)}
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 rounded-lg py-3 flex items-center justify-center gap-2"
              >
                <Key className="w-5 h-5" />
                Login with nsec
              </Button>
            </div>
          </>
        )

      case "connecting":
        return (
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-300 mb-2">Connecting to wallet...</p>
            <p className="text-slate-400 text-sm">Please approve the connection.</p>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-white mb-2">Nostr Journal</h1>
          <p className="text-slate-400">Your private thoughts, encrypted and secure.</p>
        </div>

        {renderLoginContent()}

        {loginState === "initial" && (
          <div className="mt-6 p-3 bg-slate-700/50 rounded-lg">
            <p className="text-slate-400 text-xs text-center">
              🔒 Your notes are encrypted locally using your Nostr identity. They sync across devices when you log in
              with the same credentials.
            </p>
          </div>
        )}
      </div>

      {showNwcModal && (
        <NwcConnectionManager onConnectSuccess={handleNwcConnectionSuccess} onClose={handleNwcModalClose} />
      )}

      {showNsecModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md relative">
            <button
              onClick={() => {
                setShowNsecModal(false)
                setNsecInput("")
                setError("")
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-semibold text-white mb-6 text-center">Enter your nsec</h2>

            <div className="space-y-4">
              <Input
                type="password"
                placeholder="nsec1..."
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                onKeyPress={(e) => e.key === "Enter" && handleNsecLogin()}
              />

              <Button
                onClick={handleNsecLogin}
                disabled={isConnecting || !nsecInput.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white"
              >
                {isConnecting ? "Deriving Keys..." : "Login"}
              </Button>
            </div>

            <p className="text-slate-400 text-xs text-center mt-4">
              Your nsec is processed locally and never stored or transmitted. Your public key will be derived for note
              encryption.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
