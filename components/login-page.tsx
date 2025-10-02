"use client"

/**
 * FINAL WORKING VERSION using official nostr-tools API
 * Based on: https://github.com/nbd-wtf/nostr-tools#method-2-client-initiated
 */

import { useState, useEffect, useRef } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, AlertCircle, CheckCircle2, KeyRound, Copy, Check, UserPlus } from "lucide-react"
import type { AuthData } from "./main-app"

type LoginMethod = "idle" | "extension" | "remote" | "nsec" | "generate"
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"

const RELAYS = ["wss://relay.nsec.app", "wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("idle")
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [connectUrl, setConnectUrl] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [nsecInput, setNsecInput] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<{ nsec: string; npub: string } | null>(null)

  const signerRef = useRef<any>(null)
  const poolRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const containerStyle = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    overflow: "auto",
    WebkitOverflowScrolling: "touch" as const,
  }

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = async () => {
    if (signerRef.current) {
      try {
        await signerRef.current.close()
        console.log("✅ Signer closed")
      } catch (e) {}
      signerRef.current = null
    }
    if (poolRef.current) {
      try {
        poolRef.current.close(RELAYS)
        console.log("✅ Pool closed")
      } catch (e) {}
      poolRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const handleExtensionLogin = async () => {
    setLoginMethod("extension")
    setConnectionState("connecting")
    setError("")

    try {
      if (!window.nostr) {
        throw new Error("No Nostr extension found. Install Alby or nos2x.")
      }

      const pubkey = await window.nostr.getPublicKey()
      console.log("✅ Extension login:", pubkey)

      onLoginSuccess({
        pubkey,
        authMethod: "extension",
      })
    } catch (err) {
      console.error("Extension error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Extension login failed")
    }
  }

  const handleNsecLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      const { getPublicKey } = await import("nostr-tools/pure")
      const { decode } = await import("nostr-tools/nip19")

      let privateKeyHex: string

      if (nsecInput.startsWith("nsec1")) {
        const decoded = decode(nsecInput)
        if (decoded.type !== "nsec") throw new Error("Invalid nsec")
        // Convert Uint8Array to hex string
        privateKeyHex = Array.from(decoded.data as Uint8Array)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      } else if (nsecInput.length === 64) {
        privateKeyHex = nsecInput
      } else {
        throw new Error("Invalid format. Use nsec1... or 64-char hex")
      }

      // Convert hex to Uint8Array for getPublicKey
      const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
      const pubkey = getPublicKey(privateKeyBytes)

      console.log("✅ Nsec login:", pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput.startsWith("nsec1") ? nsecInput : undefined,
        privateKey: privateKeyHex,
        authMethod: "nsec",
      })
    } catch (err) {
      console.error("Nsec error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Invalid key")
    }
  }

  const handleGenerateAccount = async () => {
    setLoginMethod("generate")
    setConnectionState("generating")
    setError("")

    try {
      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
      const { nsecEncode, npubEncode } = await import("nostr-tools/nip19")

      console.log("🔑 Generating new Nostr keypair...")

      const privateKey = generateSecretKey()
      const pubkey = getPublicKey(privateKey)

      // Convert to bech32 format
      const nsec = nsecEncode(privateKey)
      const npub = npubEncode(pubkey)

      // Convert private key to hex
      const privateKeyHex = Array.from(privateKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

      console.log("✅ Generated new account:", npub)

      setGeneratedKeys({ nsec, npub })
      setConnectionState("success")

      // Auto-login after 2 seconds
      setTimeout(() => {
        onLoginSuccess({
          pubkey,
          nsec,
          privateKey: privateKeyHex,
          authMethod: "nsec",
        })
      }, 2000)
    } catch (err) {
      console.error("Generation error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to generate account")
    }
  }

  const startRemoteSignerLogin = async () => {
    setLoginMethod("remote")
    setConnectionState("generating")
    setError("")

    try {
      console.log("🚀 Starting remote signer login (official API)")

      // Import required functions
      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
      const { SimplePool } = await import("nostr-tools/pool")
      const { BunkerSigner, createNostrConnectURI } = await import("nostr-tools/nip46")

      console.log("✅ Imports loaded")

      // Generate local secret key for this session
      const localSecretKey = generateSecretKey()
      const clientPubkey = getPublicKey(localSecretKey)

      console.log("🔑 Client pubkey:", clientPubkey)

      // Create connection URI
      const connectionUri = createNostrConnectURI({
        clientPubkey,
        relays: RELAYS,
        secret: Math.random().toString(36).substring(7),
        name: "Nostr Journal",
        url: typeof window !== "undefined" ? window.location.origin : "",
        description: "Private encrypted journal on Nostr",
      })

      console.log("📱 Connection URI:", connectionUri)
      setConnectUrl(connectionUri)
      setConnectionState("waiting")

      // Initialize pool
      const pool = new SimplePool()
      poolRef.current = pool

      console.log("⏳ Waiting for signer to connect...")

      // Set timeout
      timeoutRef.current = setTimeout(() => {
        console.log("⏱️ Connection timeout")
        setConnectionState("error")
        setError("Connection timeout. Please try again.")
        cleanup()
      }, 120000)

      // This waits for the bunker to connect and returns a ready-to-use signer
      console.log("🔌 Calling BunkerSigner.fromURI()...")

      const signer = await BunkerSigner.fromURI(localSecretKey, connectionUri, {
        pool,
        timeout: 110000, // slightly less than our UI timeout
      })

      console.log("✅ Signer connected!")
      signerRef.current = signer

      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      setConnectionState("connecting")

      // Get user's public key
      console.log("👤 Getting user pubkey...")
      const userPubkey = await signer.getPublicKey()

      console.log("✅ ========== SUCCESS! ==========")
      console.log("✅ User pubkey:", userPubkey)

      setConnectionState("success")

      setTimeout(() => {
        console.log("🚀 Calling onLoginSuccess with signer")
        onLoginSuccess({
          pubkey: userPubkey,
          authMethod: "remote",
          signer: signer,
          clientSecretKey: localSecretKey,
          bunkerPubkey: userPubkey,
          bunkerUri: connectionUri, // Store the full URI for reconnection
          relays: RELAYS,
        })
      }, 1000)
    } catch (err) {
      console.error("❌ Remote signer error:", err)
      console.error("Stack:", err instanceof Error ? err.stack : "no stack")

      setConnectionState("error")

      // Provide more helpful error messages
      const errorMessage = err instanceof Error ? err.message : "Failed to connect"
      if (errorMessage.includes("timeout")) {
        setError("Connection timeout. Make sure you approved in Nsec.app.")
      } else if (errorMessage.includes("rejected")) {
        setError("Connection rejected by signer.")
      } else {
        setError(errorMessage)
      }

      cleanup()
    }
  }

  const handleBack = () => {
    cleanup()
    setLoginMethod("idle")
    setConnectionState("idle")
    setError("")
    setConnectUrl("")
    setNsecInput("")
    setCopied(false)
    setGeneratedKeys(null)
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(connectUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleCopyKey = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div style={containerStyle} className="bg-slate-900">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Nostr Journal</h1>
            <p className="text-slate-400">Private encrypted journaling on Nostr</p>
          </div>

          <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
            {loginMethod === "idle" && (
              <div className="space-y-3">
                <button
                  onClick={handleExtensionLogin}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="h-5 w-5" />
                  Extension Login
                </button>

                <button
                  onClick={startRemoteSignerLogin}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Remote Signer (Nsec.app)
                </button>

                <button
                  onClick={() => {
                    setLoginMethod("nsec")
                    setConnectionState("idle")
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Enter Private Key
                </button>

                <button
                  onClick={handleGenerateAccount}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-5 w-5" />
                  Generate New Account
                </button>

                <p className="text-xs text-slate-400 text-center mt-4">Your keys never leave your device</p>
              </div>
            )}

            {loginMethod === "extension" && (
              <div className="text-center py-8">
                {connectionState === "connecting" && (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-slate-300">Connecting to extension...</p>
                  </>
                )}
                {connectionState === "error" && (
                  <>
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={handleBack} className="text-slate-400 hover:text-white">
                      ← Back
                    </button>
                  </>
                )}
              </div>
            )}

            {loginMethod === "nsec" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Private Key (nsec or hex)</label>
                  <input
                    type="password"
                    value={nsecInput}
                    onChange={(e) => setNsecInput(e.target.value)}
                    placeholder="nsec1... or hex"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {connectionState === "error" && (
                  <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleBack}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNsecLogin}
                    disabled={!nsecInput || connectionState === "connecting"}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {connectionState === "connecting" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Login"
                    )}
                  </button>
                </div>
              </div>
            )}

            {loginMethod === "generate" && (
              <div className="space-y-4">
                {connectionState === "generating" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-green-500 mx-auto mb-4" />
                    <p className="text-slate-300">Generating your new account...</p>
                  </div>
                )}

                {connectionState === "success" && generatedKeys && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-slate-300 font-medium mb-2">Account Created!</p>
                      <p className="text-slate-400 text-sm">Save your keys securely</p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Public Key (npub)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={generatedKeys.npub}
                            readOnly
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono"
                          />
                          <button
                            onClick={() => handleCopyKey(generatedKeys.npub)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Private Key (nsec) - Keep this secret!
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={generatedKeys.nsec}
                            readOnly
                            className="flex-1 bg-slate-900 border border-red-900/50 rounded-lg px-3 py-2 text-xs text-red-300 font-mono"
                          />
                          <button
                            onClick={() => handleCopyKey(generatedKeys.nsec)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
                      <p className="text-xs text-yellow-400">
                        ⚠️ Save your private key (nsec) somewhere safe! You'll need it to access your account from other
                        devices.
                      </p>
                    </div>

                    <p className="text-center text-slate-400 text-sm">Logging you in...</p>
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="space-y-4">
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {loginMethod === "remote" && (
              <div className="space-y-6">
                {connectionState === "generating" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                    <p className="text-slate-300">Generating connection...</p>
                  </div>
                )}

                {connectionState === "waiting" && connectUrl && (
                  <>
                    <div className="bg-white rounded-lg p-4">
                      <QRCodeSVG value={connectUrl} size={256} level="M" className="mx-auto" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-center text-slate-300 font-medium">Scan with Nsec.app</p>

                      <div className="space-y-2">
                        <p className="text-xs text-slate-400 text-center">Or copy and paste this link:</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={connectUrl}
                            readOnly
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono overflow-x-auto"
                          />
                          <button
                            onClick={handleCopyUrl}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
                            title="Copy to clipboard"
                          >
                            {copied ? (
                              <>
                                <Check className="h-4 w-4" />
                                <span className="text-xs">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4" />
                                <span className="text-xs">Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-center text-sm text-slate-400">Waiting for approval...</p>

                      <div className="flex justify-center">
                        <div className="animate-pulse flex space-x-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {connectionState === "connecting" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                    <p className="text-slate-300 text-lg font-medium mb-2">Completing connection...</p>
                    <p className="text-slate-400 text-sm">Getting your public key</p>
                  </div>
                )}

                {connectionState === "success" && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-slate-300">Connected successfully!</p>
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="space-y-4">
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {(connectionState === "waiting" || connectionState === "connecting") && (
                  <button onClick={handleBack} className="w-full text-slate-400 hover:text-white text-sm">
                    ← Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>
      signEvent: (event: any) => Promise<any>
    }
  }
}
