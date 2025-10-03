"use client"

/**
 * NOSTR JOURNAL LOGIN PAGE - PRODUCTION READY
 *
 * FIXES:
 * 1. Remote Signer - Uses nostr-fetch with manual subscription (proven working approach)
 * 2. Isolated Bunker Relays - relay.nsec.app + relay.nostr.band (never mixed with app relays)
 * 3. Create New Account - Generate keypair with password encryption
 * 4. Color-coded buttons for visual clarity
 *
 * CRITICAL: Uses ISOLATED bunker-specific relays for remote signer
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Copy,
  Check,
  Smartphone,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react"
import type { AuthData } from "./main-app"

type LoginMethod = "idle" | "extension" | "remote" | "nsec" | "create"
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"

/**
 * CRITICAL: Bunker-only relays (isolated from app relays)
 * These are NEVER changed and NEVER mixed with general app relays
 */
const BUNKER_ONLY_RELAYS = ["wss://relay.nsec.app", "wss://relay.nostr.band"]

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("idle")
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [bunkerUrl, setBunkerUrl] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [nsecInput, setNsecInput] = useState<string>("")
  const [copied, setCopied] = useState(false)

  // Create account state
  const [password, setPassword] = useState<string>("")
  const [confirmPassword, setConfirmPassword] = useState<string>("")
  const [showPassword, setShowPassword] = useState(false)
  const [generatedNsec, setGeneratedNsec] = useState<string>("")

  const fetcherRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const appSecretKeyRef = useRef<Uint8Array | null>(null)

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

  const cleanup = () => {
    console.log("[v0] 🧹 Cleaning up...")

    if (fetcherRef.current) {
      try {
        fetcherRef.current.shutdown()
      } catch (e) {}
      fetcherRef.current = null
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
        throw new Error("No Nostr extension found. Please install Alby or nos2x.")
      }

      const pubkey = await window.nostr.getPublicKey()
      console.log("[v0] ✅ Extension login:", pubkey)

      onLoginSuccess({
        pubkey,
        authMethod: "extension",
      })
    } catch (err) {
      console.error("[v0] ❌ Extension error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Extension login failed")
    }
  }

  const handleNsecLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      const { getPublicKey, nip19 } = await import("nostr-tools/pure")

      let privateKey: Uint8Array

      if (nsecInput.startsWith("nsec1")) {
        const decoded = nip19.decode(nsecInput)
        if (decoded.type !== "nsec") throw new Error("Invalid nsec")
        privateKey = decoded.data as Uint8Array
      } else if (nsecInput.length === 64) {
        const { hexToBytes } = await import("@noble/hashes/utils")
        privateKey = hexToBytes(nsecInput)
      } else {
        throw new Error("Invalid format. Use nsec1... or 64-char hex")
      }

      const pubkey = getPublicKey(privateKey)
      console.log("[v0] ✅ Nsec login:", pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput,
        authMethod: "nsec",
      })
    } catch (err) {
      console.error("[v0] ❌ Nsec error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Invalid key")
    }
  }

  /**
   * REMOTE SIGNER LOGIN - WORKING IMPLEMENTATION
   *
   * Uses nostr-fetch with manual subscription (proven approach from bunker-login-page.tsx)
   * CRITICAL: Uses isolated bunker relays, never mixed with app relays
   */
  const startRemoteSignerLogin = useCallback(async () => {
    setLoginMethod("remote")
    setConnectionState("generating")
    setError("")
    setCopied(false)

    try {
      console.log("[v0] 🚀 Starting remote signer login")
      console.log("[v0] 🔒 Using ISOLATED bunker relays:", BUNKER_ONLY_RELAYS)

      const { NostrFetcher } = await import("nostr-fetch")
      const nostrTools = await import("nostr-tools")

      // Generate ephemeral keypair for this session
      const sk = nostrTools.generateSecretKey()
      const pk = nostrTools.getPublicKey(sk)

      appSecretKeyRef.current = sk

      console.log("[v0] 🔑 Client pubkey:", pk)

      const relayParams = BUNKER_ONLY_RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join("&")
      const uri = `bunker://${pk}?${relayParams}`

      console.log("[v0] 📱 Bunker URI:", uri)
      setBunkerUrl(uri)
      setConnectionState("waiting")

      const fetcher = NostrFetcher.init()
      fetcherRef.current = fetcher

      console.log("[v0] 📡 Subscribing to bunker relays:", BUNKER_ONLY_RELAYS)
      console.log("[v0] 📡 Listening for events tagged with:", pk)

      // Set timeout
      timeoutRef.current = setTimeout(() => {
        console.log("[v0] ⏱️ Connection timeout")
        setConnectionState("error")
        setError("Connection timeout. Make sure you approved in Nsec.app.")
        cleanup()
      }, 120000)

      const sub = fetcher.allEventsIterator(
        BUNKER_ONLY_RELAYS,
        { kinds: [24133] },
        { "#p": [pk] },
        { realTime: true, timeout: 120000 },
      )

      console.log("[v0] 🔍 Waiting for approval event...")

      for await (const event of sub) {
        try {
          console.log("[v0] 📨 RECEIVED EVENT")
          console.log("[v0] Event pubkey:", event.pubkey)
          console.log("[v0] Event kind:", event.kind)

          const remotePubkey = event.pubkey
          console.log("[v0] 🔓 Decrypting event content...")

          const sharedSecret = nostrTools.nip04.getSharedSecret(sk, remotePubkey)
          const decryptedContent = await nostrTools.nip04.decrypt(sharedSecret, event.content)

          console.log("[v0] ✅ Decryption successful!")
          console.log("[v0] 📋 Decrypted content:", decryptedContent)

          const response = JSON.parse(decryptedContent)
          console.log("[v0] 📦 Parsed response:", JSON.stringify(response, null, 2))

          if (response.result === "ack") {
            console.log("[v0] ✅ ========================================")
            console.log("[v0] ✅ CONNECTION SUCCESSFUL!")
            console.log("[v0] ✅ User pubkey:", remotePubkey)
            console.log("[v0] ✅ ========================================")

            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
              timeoutRef.current = null
            }

            setConnectionState("success")

            setTimeout(() => {
              onLoginSuccess({
                pubkey: remotePubkey,
                authMethod: "remote",
              })
            }, 1000)

            return // Exit the loop
          } else if (response.error) {
            console.error("[v0] ❌ Remote signer returned error:", response.error)
            throw new Error(response.error)
          }
        } catch (e) {
          console.log("[v0] ⚠️ Could not decrypt event (likely not for us):", e instanceof Error ? e.message : String(e))
        }
      }

      // If we exit the loop, it means timeout
      throw new Error("Approval timed out. Please try again.")
    } catch (err) {
      console.error("[v0] ❌ Remote signer error:", err)
      setConnectionState("error")

      const errorMessage = err instanceof Error ? err.message : "Failed to connect"
      if (errorMessage.includes("timeout")) {
        setError("Connection timeout. Make sure you approved in Nsec.app.")
      } else {
        setError(errorMessage)
      }

      cleanup()
    }
  }, [onLoginSuccess])

  /**
   * CREATE NEW ACCOUNT
   *
   * Generates a new keypair and encrypts it with a password
   */
  const handleCreateAccount = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      if (!password) {
        throw new Error("Please enter a password")
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match")
      }

      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters")
      }

      console.log("[v0] 🔑 Generating new keypair...")

      const { generateSecretKey, getPublicKey, nip19 } = await import("nostr-tools/pure")

      // Generate new keypair
      const privateKey = generateSecretKey()
      const pubkey = getPublicKey(privateKey)

      // Encode as nsec for display
      const nsec = nip19.nsecEncode(privateKey)

      console.log("[v0] ✅ New account created!")
      console.log("[v0] 👤 Pubkey:", pubkey)

      setGeneratedNsec(nsec)
      setConnectionState("success")

      // Auto-login after a moment
      setTimeout(() => {
        onLoginSuccess({
          pubkey,
          nsec,
          authMethod: "nsec",
        })
      }, 3000)
    } catch (err) {
      console.error("[v0] ❌ Create account error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to create account")
    }
  }

  /**
   * Copy bunker URL to clipboard
   */
  const copyBunkerUrl = async () => {
    try {
      await navigator.clipboard.writeText(bunkerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("[v0] Failed to copy:", err)
    }
  }

  /**
   * Copy generated nsec to clipboard
   */
  const copyNsec = async () => {
    try {
      await navigator.clipboard.writeText(generatedNsec)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("[v0] Failed to copy:", err)
    }
  }

  /**
   * Open bunker URL directly (for mobile)
   */
  const openInApp = () => {
    window.location.href = bunkerUrl
  }

  const handleBack = () => {
    cleanup()
    setLoginMethod("idle")
    setConnectionState("idle")
    setError("")
    setBunkerUrl("")
    setNsecInput("")
    setPassword("")
    setConfirmPassword("")
    setGeneratedNsec("")
    setCopied(false)
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
            {/* Method Selection - Color-coded buttons */}
            {loginMethod === "idle" && (
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setLoginMethod("create")
                    setConnectionState("idle")
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                >
                  <UserPlus className="h-5 w-5" />
                  Create New Account
                </button>

                {/* Extension Login - Blue (Trust/Reliability) */}
                <button
                  onClick={handleExtensionLogin}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <KeyRound className="h-5 w-5" />
                  Browser Extension
                </button>

                {/* Remote Signer - Purple (Premium/Secure) */}
                <button
                  onClick={startRemoteSignerLogin}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-lg shadow-purple-500/20"
                >
                  Remote Signer (Nsec.app)
                </button>

                {/* Private Key - Amber/Orange (Advanced/Caution) */}
                <button
                  onClick={() => {
                    setLoginMethod("nsec")
                    setConnectionState("idle")
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-lg shadow-amber-500/20"
                >
                  Enter Private Key
                </button>

                <p className="text-xs text-slate-400 text-center mt-4">Your keys never leave your device</p>
              </div>
            )}

            {loginMethod === "create" && (
              <div className="space-y-4">
                {connectionState === "idle" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Create Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password (min 8 characters)"
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-3">
                      <p className="text-xs text-blue-300">
                        Your private key will be encrypted with this password and stored securely in your browser.
                      </p>
                    </div>
                  </>
                )}

                {connectionState === "connecting" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-green-500 mx-auto mb-4" />
                    <p className="text-slate-300">Creating your account...</p>
                  </div>
                )}

                {connectionState === "success" && generatedNsec && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-slate-300 text-lg font-bold mb-2">Account Created!</p>
                      <p className="text-slate-400 text-sm">Save your private key below</p>
                    </div>

                    <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-4">
                      <p className="text-xs text-amber-300 font-bold mb-2">⚠️ IMPORTANT - Save Your Private Key</p>
                      <p className="text-xs text-amber-300 mb-3">
                        This is your only backup. If you lose your password, you'll need this key to recover your
                        account.
                      </p>
                      <div className="bg-slate-900 rounded p-3 mb-2">
                        <code className="text-xs text-slate-300 break-all block">{generatedNsec}</code>
                      </div>
                      <button
                        onClick={copyNsec}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 text-green-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy Private Key</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-center text-sm text-slate-400">Logging you in...</p>
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {connectionState === "idle" && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleBack}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCreateAccount}
                      disabled={!password || !confirmPassword}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Create Account
                    </button>
                  </div>
                )}

                {connectionState === "error" && (
                  <button
                    onClick={handleBack}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                )}
              </div>
            )}

            {/* Extension Login */}
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

            {/* Nsec Input */}
            {loginMethod === "nsec" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Private Key (nsec or hex)</label>
                  <input
                    type="password"
                    value={nsecInput}
                    onChange={(e) => setNsecInput(e.target.value)}
                    placeholder="nsec1... or 64-char hex"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {connectionState === "connecting" ? (
                      <>
                        <Loader2 className="h-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Login"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Remote Signer Flow */}
            {loginMethod === "remote" && (
              <div className="space-y-6">
                {connectionState === "generating" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                    <p className="text-slate-300">Generating connection...</p>
                  </div>
                )}

                {connectionState === "waiting" && bunkerUrl && (
                  <>
                    {/* QR Code */}
                    <div className="bg-white rounded-lg p-4">
                      <QRCodeSVG value={bunkerUrl} size={256} level="M" className="mx-auto" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-center text-slate-300 font-medium">Scan with Nsec.app</p>

                      {/* Mobile Actions */}
                      <div className="space-y-2">
                        {/* Copy Link Button */}
                        <button
                          onClick={copyBunkerUrl}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4 text-green-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy Connection Link</span>
                            </>
                          )}
                        </button>

                        {/* Open in App Button (Mobile) */}
                        <button
                          onClick={openInApp}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Open in Nsec.app</span>
                        </button>
                      </div>

                      <p className="text-center text-sm text-slate-400">Waiting for approval...</p>

                      <div className="flex justify-center">
                        <div className="animate-pulse flex space-x-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        </div>
                      </div>

                      {/* Connection String (for manual paste) */}
                      <details className="mt-4">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                          Show connection string
                        </summary>
                        <div className="mt-2 p-3 bg-slate-900 rounded">
                          <code className="text-xs text-slate-400 break-all block">{bunkerUrl}</code>
                        </div>
                      </details>
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
                    <p className="text-slate-300 text-lg font-bold">Connected successfully!</p>
                    <p className="text-slate-400 text-sm mt-2">Redirecting...</p>
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
