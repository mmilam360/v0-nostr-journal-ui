"use client"

/**
 * FINAL WORKING VERSION using official nostr-tools API
 * Based on: https://github.com/nbd-wtf/nostr-tools#method-2-client-initiated
 */

import { useState, useEffect, useRef } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, AlertCircle, CheckCircle2, KeyRound, Copy, Check, UserPlus, Settings } from "lucide-react"
import type { AuthData } from "./main-app"
import { RelayManager, getRelays } from "./relay-manager"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"

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
  const [showRelayManager, setShowRelayManager] = useState(false)
  const [relays, setRelays] = useState<string[]>(RELAYS)
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [masterPassword, setMasterPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [generatedAuthData, setGeneratedAuthData] = useState<AuthData | null>(null)

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
    const savedRelays = getRelays()
    setRelays(savedRelays)
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

      setGeneratedAuthData({
        pubkey,
        nsec,
        privateKey: privateKeyHex,
        authMethod: "nsec",
      })
      setShowPasswordSetup(true)
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

      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
      const { SimplePool } = await import("nostr-tools/pool")
      const { BunkerSigner, createNostrConnectURI } = await import("nostr-tools/nip46")

      console.log("✅ Imports loaded")

      const localSecretKey = generateSecretKey()
      const clientPubkey = getPublicKey(localSecretKey)

      console.log("🔑 Client pubkey:", clientPubkey)

      const connectionUri = createNostrConnectURI({
        clientPubkey,
        relays: relays,
        secret: Math.random().toString(36).substring(7),
        name: "Nostr Journal",
        url: typeof window !== "undefined" ? window.location.origin : "",
        description: "Private encrypted journal on Nostr",
      })

      console.log("📱 Connection URI:", connectionUri)
      setConnectUrl(connectionUri)
      setConnectionState("waiting")

      timeoutRef.current = setTimeout(() => {
        console.log("⏱️ Connection timeout")
        setConnectionState("error")
        setError("Connection timeout. Please try again.")
        cleanup()
      }, 120000)

      console.log("🔌 Calling BunkerSigner.fromURI()...")

      const signer = await BunkerSigner.fromURI(localSecretKey, connectionUri, {
        pool: poolRef.current,
        timeout: 110000,
      })

      console.log("✅ Signer connected!")
      signerRef.current = signer

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      setConnectionState("connecting")

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
          bunkerUri: connectionUri,
          relays: relays,
        })
      }, 1000)
    } catch (err) {
      console.error("❌ Remote signer error:", err)
      console.error("Stack:", err instanceof Error ? err.stack : "no stack")

      setConnectionState("error")

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
    setShowRelayManager(false)
    setShowPasswordSetup(false)
    setMasterPassword("")
    setConfirmPassword("")
    setShowPassword(false)
    setGeneratedAuthData(null)
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

  const handlePasswordSetup = () => {
    if (masterPassword.length < 8) {
      setError("Password must be at least 8 characters long")
      return
    }
    if (masterPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (!generatedAuthData) {
      setError("No account data found")
      return
    }

    localStorage.setItem("nostr-journal-master-password", masterPassword)

    onLoginSuccess(generatedAuthData)
  }

  return (
    <div style={containerStyle} className="bg-background">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">Nostr Journal</h1>
            <p className="text-muted-foreground">Private encrypted journaling on Nostr</p>
          </div>

          <div className="bg-card rounded-lg shadow-xl p-6 border border-border">
            {loginMethod === "idle" && (
              <div className="space-y-3">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setShowRelayManager(true)}
                    className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
                  >
                    <Settings className="h-4 w-4" />
                    Relay Settings
                  </button>
                </div>

                <button
                  onClick={handleExtensionLogin}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="h-5 w-5" />
                  Extension Login
                </button>

                <button
                  onClick={startRemoteSignerLogin}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Remote Signer (Nsec.app)
                </button>

                <button
                  onClick={() => {
                    setLoginMethod("nsec")
                    setConnectionState("idle")
                  }}
                  className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  Enter Private Key
                </button>

                <button
                  onClick={handleGenerateAccount}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-5 w-5" />
                  Generate New Account
                </button>

                <p className="text-xs text-muted-foreground text-center mt-4">Your keys never leave your device</p>
              </div>
            )}

            {loginMethod === "extension" && (
              <div className="text-center py-8">
                {connectionState === "connecting" && (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground">Connecting to extension...</p>
                  </>
                )}
                {connectionState === "error" && (
                  <>
                    <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <p className="text-destructive mb-4">{error}</p>
                    <button onClick={handleBack} className="text-muted-foreground hover:text-foreground">
                      ← Back
                    </button>
                  </>
                )}
              </div>
            )}

            {loginMethod === "nsec" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Private Key (nsec or hex)
                  </label>
                  <input
                    type="password"
                    value={nsecInput}
                    onChange={(e) => setNsecInput(e.target.value)}
                    placeholder="nsec1... or hex"
                    className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {connectionState === "error" && (
                  <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleBack}
                    className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNsecLogin}
                    disabled={!nsecInput || connectionState === "connecting"}
                    className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground">Generating your new account...</p>
                  </div>
                )}

                {connectionState === "success" && generatedKeys && !showPasswordSetup && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <CheckCircle2 className="h-12 w-12 text-accent mx-auto mb-4" />
                      <p className="text-foreground font-medium mb-2">Account Created!</p>
                      <p className="text-muted-foreground text-sm">Save your keys securely</p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Public Key (npub)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={generatedKeys.npub}
                            readOnly
                            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono"
                          />
                          <button
                            onClick={() => handleCopyKey(generatedKeys.npub)}
                            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-3 py-2 rounded-lg transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Private Key (nsec) - Keep this secret!
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={generatedKeys.nsec}
                            readOnly
                            className="flex-1 bg-muted border border-destructive/50 rounded-lg px-3 py-2 text-xs text-destructive font-mono"
                          />
                          <button
                            onClick={() => handleCopyKey(generatedKeys.nsec)}
                            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-3 py-2 rounded-lg transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-semibold text-destructive">⚠️ IMPORTANT: Save Your Private Key!</p>
                      <p className="text-xs text-destructive/90">
                        Your private key (nsec) is the ONLY way to access your account. If you lose it or get logged
                        out, you will NOT be able to recover your account. Please save it in a secure password manager
                        or write it down and store it safely.
                      </p>
                    </div>
                  </div>
                )}

                {showPasswordSetup && generatedKeys && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <CheckCircle2 className="h-12 w-12 text-accent mx-auto mb-4" />
                      <p className="text-foreground font-medium mb-2">Set Up Master Password</p>
                      <p className="text-muted-foreground text-sm">
                        Create a password to encrypt and protect your account
                      </p>
                    </div>

                    <div className="bg-accent/10 border border-accent/50 rounded-lg p-3">
                      <p className="text-xs text-accent-foreground">
                        ✓ Your keys have been saved. Now create a master password to secure your account on this device.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="master-password" className="text-foreground">
                          Master Password
                        </Label>
                        <div className="relative">
                          <Input
                            id="master-password"
                            type={showPassword ? "text" : "password"}
                            value={masterPassword}
                            onChange={(e) => setMasterPassword(e.target.value)}
                            className="bg-muted border-border text-foreground pr-10"
                            placeholder="Enter a strong password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="confirm-password" className="text-foreground">
                          Confirm Password
                        </Label>
                        <Input
                          id="confirm-password"
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="bg-muted border-border text-foreground"
                          placeholder="Confirm your password"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
                        <p className="text-sm text-destructive">{error}</p>
                      </div>
                    )}

                    <button
                      onClick={handlePasswordSetup}
                      disabled={!masterPassword || !confirmPassword}
                      className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Complete Setup & Login
                    </button>
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="space-y-4">
                    <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
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
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground text-lg font-medium mb-2">Generating connection...</p>
                    <p className="text-muted-foreground text-sm">Getting your public key</p>
                  </div>
                )}

                {connectionState === "waiting" && connectUrl && (
                  <>
                    <div className="bg-white rounded-lg p-4">
                      <QRCodeSVG value={connectUrl} size={256} level="M" className="mx-auto" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-center text-foreground font-medium">Scan with Nsec.app</p>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground text-center">Or copy and paste this link:</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={connectUrl}
                            readOnly
                            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono overflow-x-auto"
                          />
                          <button
                            onClick={handleCopyUrl}
                            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
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

                      <p className="text-center text-sm text-muted-foreground">Waiting for approval...</p>

                      <div className="flex justify-center">
                        <div className="animate-pulse flex space-x-2">
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {connectionState === "connecting" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground text-lg font-medium mb-2">Completing connection...</p>
                    <p className="text-muted-foreground text-sm">Getting your public key</p>
                  </div>
                )}

                {connectionState === "success" && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-accent mx-auto mb-4" />
                    <p className="text-foreground">Connected successfully!</p>
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="space-y-4">
                    <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {(connectionState === "waiting" || connectionState === "connecting") && (
                  <button onClick={handleBack} className="w-full text-muted-foreground hover:text-foreground text-sm">
                    ← Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showRelayManager && (
        <RelayManager
          onClose={() => setShowRelayManager(false)}
          onSave={(newRelays) => {
            setRelays(newRelays)
            setShowRelayManager(false)
          }}
          initialRelays={relays}
        />
      )}
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
