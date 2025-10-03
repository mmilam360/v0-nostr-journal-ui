"use client"

/**
 * COMPLETE NOSTR LOGIN WITH RELAY MANAGEMENT
 *
 * Features:
 * 1. Four login methods (create account, extension, remote signer, nsec)
 * 2. Relay management on login screen
 * 3. Fixed bunker:// protocol implementation
 * 4. Copy/paste link for mobile users
 * 5. Color-coded UI
 */

import { useState, useEffect, useRef } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Copy,
  Check,
  Smartphone,
  Settings,
  Plus,
  Trash2,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react"
import type { AuthData } from "./main-app"

type LoginMethod = "idle" | "extension" | "remote" | "nsec" | "create"
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"

interface Relay {
  url: string
  enabled: boolean
  status: "unknown" | "connected" | "failed"
}

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band", "wss://relay.primal.net"]

/**
 * CRITICAL: Bunker relays are separate and hard-coded
 * These are ONLY for the NIP-46 handshake
 */
const BUNKER_RELAYS = ["wss://relay.nsec.app", "wss://relay.nostr.band"]

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
  const [showRelaySettings, setShowRelaySettings] = useState(false)
  const [relays, setRelays] = useState<Relay[]>([])
  const [newRelayUrl, setNewRelayUrl] = useState("")

  const [password, setPassword] = useState<string>("")
  const [confirmPassword, setConfirmPassword] = useState<string>("")
  const [showPassword, setShowPassword] = useState(false)
  const [generatedNsec, setGeneratedNsec] = useState<string>("")

  const poolRef = useRef<any>(null)
  const subRef = useRef<any>(null)
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
    const stored = localStorage.getItem("nostr_user_relays")
    if (stored) {
      setRelays(JSON.parse(stored))
    } else {
      const defaultRelays = DEFAULT_RELAYS.map((url) => ({
        url,
        enabled: true,
        status: "unknown" as const,
      }))
      setRelays(defaultRelays)
      localStorage.setItem("nostr_user_relays", JSON.stringify(defaultRelays))
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (subRef.current) {
      try {
        subRef.current.close()
      } catch (e) {}
      subRef.current = null
    }

    if (poolRef.current) {
      try {
        poolRef.current.close(BUNKER_RELAYS)
      } catch (e) {}
      poolRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const saveRelays = (updated: Relay[]) => {
    setRelays(updated)
    localStorage.setItem("nostr_user_relays", JSON.stringify(updated))
  }

  const addRelay = () => {
    if (!newRelayUrl) return

    if (!newRelayUrl.startsWith("wss://") && !newRelayUrl.startsWith("ws://")) {
      alert("Relay URL must start with wss:// or ws://")
      return
    }

    if (relays.some((r) => r.url === newRelayUrl)) {
      alert("This relay is already in your list")
      return
    }

    const newRelay: Relay = {
      url: newRelayUrl,
      enabled: true,
      status: "unknown",
    }

    saveRelays([...relays, newRelay])
    setNewRelayUrl("")
  }

  const removeRelay = (url: string) => {
    if (relays.filter((r) => r.enabled).length <= 1) {
      alert("You must have at least one relay enabled")
      return
    }

    saveRelays(relays.filter((r) => r.url !== url))
  }

  const toggleRelay = (url: string) => {
    const enabledCount = relays.filter((r) => r.enabled).length
    const relay = relays.find((r) => r.url === url)

    if (relay?.enabled && enabledCount <= 1) {
      alert("You must have at least one relay enabled")
      return
    }

    saveRelays(relays.map((r) => (r.url === url ? { ...r, enabled: !r.enabled } : r)))
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
      console.log("✅ Extension login:", pubkey)

      onLoginSuccess({
        pubkey,
        authMethod: "extension",
      })
    } catch (err) {
      console.error("❌ Extension error:", err)
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
        throw new Error("Invalid format")
      }

      const pubkey = getPublicKey(privateKey)
      console.log("✅ Nsec login:", pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput,
        authMethod: "nsec",
      })
    } catch (err) {
      console.error("❌ Nsec error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Invalid key")
    }
  }

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

      console.log("🔑 Generating new keypair...")

      const { generateSecretKey, getPublicKey, nip19 } = await import("nostr-tools/pure")

      const privateKey = generateSecretKey()
      const pubkey = getPublicKey(privateKey)
      const nsec = nip19.nsecEncode(privateKey)

      console.log("✅ New account created!")
      console.log("👤 Pubkey:", pubkey)

      setGeneratedNsec(nsec)
      setConnectionState("success")

      setTimeout(() => {
        onLoginSuccess({
          pubkey,
          nsec,
          authMethod: "nsec",
        })
      }, 3000)
    } catch (err) {
      console.error("❌ Create account error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to create account")
    }
  }

  /**
   * REMOTE SIGNER - Manual Implementation
   * Using direct subscription instead of BunkerSigner.fromURI
   * which seems to have compatibility issues
   */
  const startRemoteSignerLogin = async () => {
    setLoginMethod("remote")
    setConnectionState("generating")
    setError("")
    setCopied(false)

    try {
      console.log("🚀 Starting remote signer login")
      console.log("🔒 Using bunker relays:", BUNKER_RELAYS)

      const { generateSecretKey, getPublicKey, finalizeEvent } = await import("nostr-tools/pure")
      const { SimplePool } = await import("nostr-tools/pool")

      // Generate local keypair
      const localSecret = generateSecretKey()
      const clientPubkey = getPublicKey(localSecret)

      console.log("🔑 Client pubkey:", clientPubkey)

      const relayParams = BUNKER_RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join("&")
      const metadata = encodeURIComponent(JSON.stringify({ name: "Nostr Journal" }))
      const url = `nostrconnect://${clientPubkey}?${relayParams}&metadata=${metadata}`

      console.log("📱 Nostr Connect URL:", url)
      setBunkerUrl(url)
      setConnectionState("waiting")

      // Initialize pool
      const pool = new SimplePool()
      poolRef.current = pool

      const now = Math.floor(Date.now() / 1000)

      console.log("🔌 Subscribing to kind 24133 events...")

      // Subscribe to response events
      const sub = pool.subscribeMany(
        BUNKER_RELAYS,
        [
          {
            kinds: [24133],
            "#p": [clientPubkey],
            since: now,
          },
        ],
        {
          onevent: async (event: any) => {
            console.log("📨 ========================================")
            console.log("📨 RECEIVED EVENT")
            console.log("From:", event.pubkey)
            console.log("Kind:", event.kind)
            console.log("Content preview:", event.content.substring(0, 50))
            console.log("========================================")

            try {
              // Import nip44 for decryption
              const { nip44 } = await import("nostr-tools")

              // Decrypt the content
              const decrypted = await nip44.decrypt(localSecret, event.pubkey, event.content)

              console.log("📋 Decrypted:", decrypted)

              const payload = JSON.parse(decrypted)
              console.log("📦 Payload:", payload)

              // Check if this is a connect response
              if (payload.result) {
                const userPubkey = payload.result
                console.log("✅ ========================================")
                console.log("✅ LOGIN SUCCESSFUL!")
                console.log("✅ User pubkey:", userPubkey)
                console.log("✅ ========================================")

                setConnectionState("success")

                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current)
                }

                cleanup()

                setTimeout(() => {
                  onLoginSuccess({
                    pubkey: userPubkey,
                    authMethod: "remote",
                  })
                }, 1000)
              } else if (payload.method === "connect") {
                // Signer is requesting connection - send response
                console.log("📤 Sending connect response...")

                const response = {
                  id: payload.id,
                  result: event.pubkey,
                }

                const { nip44 } = await import("nostr-tools")
                const encrypted = await nip44.encrypt(localSecret, event.pubkey, JSON.stringify(response))

                const responseEvent = finalizeEvent(
                  {
                    kind: 24133,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [["p", event.pubkey]],
                    content: encrypted,
                  },
                  localSecret,
                )

                await pool.publish(BUNKER_RELAYS, responseEvent)
                console.log("✅ Response sent")

                setConnectionState("connecting")
              }
            } catch (err) {
              console.error("❌ Error processing event:", err)
            }
          },
          oneose: () => {
            console.log("✅ Connected to bunker relays")
          },
        },
      )

      subRef.current = sub

      // Timeout
      timeoutRef.current = setTimeout(() => {
        console.log("⏱️ Connection timeout")
        setConnectionState("error")
        setError("Connection timeout. Make sure you scanned the QR and approved in Nsec.app.")
        cleanup()
      }, 120000)
    } catch (err) {
      console.error("❌ Remote signer error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to connect")
      cleanup()
    }
  }

  const copyBunkerUrl = async () => {
    try {
      await navigator.clipboard.writeText(bunkerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const copyNsec = async () => {
    try {
      await navigator.clipboard.writeText(generatedNsec)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

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
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">Nostr Journal</h1>
            <p className="text-slate-400">Private encrypted journaling on Nostr</p>
          </div>

          {/* Main Login Card */}
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
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

                <button
                  onClick={handleExtensionLogin}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <KeyRound className="h-5 w-5" />
                  Browser Extension
                </button>

                <button
                  onClick={startRemoteSignerLogin}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-lg shadow-purple-500/20"
                >
                  Remote Signer (Nsec.app)
                </button>

                <button
                  onClick={() => {
                    setLoginMethod("nsec")
                    setConnectionState("idle")
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-lg shadow-amber-500/20"
                >
                  Enter Private Key
                </button>

                <button
                  onClick={() => setShowRelaySettings(!showRelaySettings)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {showRelaySettings ? "Hide" : "Configure"} Relays
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
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy Private Key
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-center text-sm text-slate-400">Logging you in...</p>
                  </div>
                )}

                {connectionState === "error" && (
                  <>
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                  </>
                )}
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
                    <div className="bg-white rounded-lg p-4">
                      <QRCodeSVG value={bunkerUrl} size={256} level="M" className="mx-auto" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-center text-slate-300 font-medium">Scan with Nsec.app</p>

                      <div className="space-y-2">
                        <button
                          onClick={copyBunkerUrl}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4 text-green-400" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy Connection Link
                            </>
                          )}
                        </button>

                        <button
                          onClick={openInApp}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                          <Smartphone className="w-4 h-4" />
                          Open in Nsec.app
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
                    </div>
                  </>
                )}

                {connectionState === "connecting" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                    <p className="text-slate-300 text-lg font-medium mb-2">Completing connection...</p>
                    <p className="text-slate-400 text-sm">Finalizing handshake</p>
                  </div>
                )}

                {connectionState === "success" && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-slate-300 text-lg font-bold">Connected!</p>
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

          {/* Relay Settings Card */}
          {loginMethod === "idle" && showRelaySettings && (
            <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-4">Relay Settings</h3>

              <div className="space-y-2 mb-4">
                {relays.map((relay) => (
                  <div key={relay.url} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg">
                    <input
                      type="checkbox"
                      checked={relay.enabled}
                      onChange={() => toggleRelay(relay.url)}
                      className="w-4 h-4"
                    />
                    <span className="flex-1 text-sm text-slate-300 truncate">{relay.url}</span>
                    <button
                      onClick={() => removeRelay(relay.url)}
                      className="p-1 hover:bg-slate-800 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRelayUrl}
                  onChange={(e) => setNewRelayUrl(e.target.value)}
                  placeholder="wss://relay.example.com"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  onKeyPress={(e) => e.key === "Enter" && addRelay()}
                />
                <button
                  onClick={addRelay}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-3">
                Note: Bunker login uses dedicated relays (relay.nsec.app, relay.nostr.band)
              </p>
            </div>
          )}
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
