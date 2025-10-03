"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertCircle, CheckCircle2, KeyRound, Copy, UserPlus, Settings } from "lucide-react"
import type { AuthData } from "./main-app"
import { RelayManager, getRelays } from "./relay-manager"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

type LoginMethod = "idle" | "extension" | "remote" | "nsec" | "generate"
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"

const NOAUTH_RELAY = "wss://relay.nostr.band"

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("idle")
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [error, setError] = useState<string>("")
  const [nsecInput, setNsecInput] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<{ nsec: string; npub: string } | null>(null)
  const [showRelayManager, setShowRelayManager] = useState(false)
  const [relays, setRelays] = useState<string[]>([NOAUTH_RELAY])
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [masterPassword, setMasterPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [generatedAuthData, setGeneratedAuthData] = useState<AuthData | null>(null)
  const [bunkerUri, setBunkerUri] = useState<string>("")
  const [userPubkey, setUserPubkey] = useState<string>("")

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
  }, [])

  const handleExtensionLogin = async () => {
    setLoginMethod("extension")
    setConnectionState("connecting")
    setError("")

    try {
      if (!window.nostr) {
        throw new Error("No Nostr extension found. Install Alby or nos2x.")
      }

      const pubkey = await window.nostr.getPublicKey()
      console.log("[v0] ✅ Extension login:", pubkey)

      onLoginSuccess({
        pubkey,
        authMethod: "extension",
      })
    } catch (err) {
      console.error("[v0] Extension error:", err)
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
        privateKeyHex = Array.from(decoded.data as Uint8Array)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      } else if (nsecInput.length === 64) {
        privateKeyHex = nsecInput
      } else {
        throw new Error("Invalid format. Use nsec1... or 64-char hex")
      }

      const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)))
      const pubkey = getPublicKey(privateKeyBytes)

      console.log("[v0] ✅ Nsec login:", pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput.startsWith("nsec1") ? nsecInput : undefined,
        privateKey: privateKeyHex,
        authMethod: "nsec",
      })
    } catch (err) {
      console.error("[v0] Nsec error:", err)
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

      console.log("[v0] 🔑 Generating new Nostr keypair...")

      const privateKey = generateSecretKey()
      const pubkey = getPublicKey(privateKey)

      const nsec = nsecEncode(privateKey)
      const npub = npubEncode(pubkey)

      const privateKeyHex = Array.from(privateKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

      console.log("[v0] ✅ Generated new account:", npub)

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
      console.error("[v0] Generation error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to generate account")
    }
  }

  const handleRemoteSignerLogin = async () => {
    setLoginMethod("remote")
    setConnectionState("generating")
    setError("")

    let pool: any = null
    let sub: any = null
    let timeoutId: NodeJS.Timeout | null = null

    try {
      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
      const { SimplePool } = await import("nostr-tools/pool")

      const appSecretKey = generateSecretKey()
      const appPublicKey = getPublicKey(appSecretKey)
      const uri = `bunker://${appPublicKey}?relay=${NOAUTH_RELAY}`

      console.log("[v0] 🔑 Generated ephemeral keypair")
      console.log("[v0] 📱 Bunker URI:", uri)

      setBunkerUri(uri)
      setConnectionState("waiting")

      console.log("[v0] 🔌 Initializing SimplePool...")
      pool = new SimplePool()

      console.log("[v0] 📡 Subscribing to relay:", NOAUTH_RELAY)
      console.log("[v0] 📡 Listening for events tagged with:", appPublicKey)

      // Create a promise that will resolve when we get the approval event
      const approvalPromise = new Promise<string>((resolve, reject) => {
        // Set up timeout
        timeoutId = setTimeout(() => {
          reject(new Error("Approval timed out. Please try again."))
        }, 120000) // 2 minutes

        // Subscribe to events
        sub = pool.sub(
          [NOAUTH_RELAY],
          [
            {
              kinds: [24133],
              "#p": [appPublicKey],
            },
          ],
        )

        console.log("[v0] 🔍 Waiting for approval event...")

        // Listen for events
        sub.on("event", async (event: any) => {
          try {
            console.log("[v0] 📨 RECEIVED EVENT")
            console.log("[v0] Event pubkey:", event.pubkey)

            const remotePubkey = event.pubkey

            const { nip04 } = await import("nostr-tools")
            const sharedSecret = nip04.getSharedSecret(appSecretKey, remotePubkey)
            const decryptedContent = await nip04.decrypt(sharedSecret, event.content)

            console.log("[v0] ✅ Decryption successful!")

            const response = JSON.parse(decryptedContent)
            console.log("[v0] 📦 Parsed response:", JSON.stringify(response, null, 2))

            if (response.result === "ack") {
              console.log("[v0] ✅ Remote signer login successful:", remotePubkey)
              resolve(remotePubkey)
            }
          } catch (e) {
            console.log("[v0] ⚠️ Could not decrypt event (likely not for us):", e)
          }
        })

        sub.on("eose", () => {
          console.log("[v0] 📭 End of stored events, now listening for real-time events...")
        })
      })

      // Wait for approval
      const remotePubkey = await approvalPromise

      setConnectionState("success")
      setUserPubkey(remotePubkey)

      onLoginSuccess({
        pubkey: remotePubkey,
        authMethod: "remote",
      })
    } catch (err) {
      console.error("[v0] ❌ Remote signer error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Remote signer login failed")
    } finally {
      // Clean up
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (sub) {
        console.log("[v0] 🧹 Closing subscription...")
        sub.unsub()
      }
      if (pool) {
        console.log("[v0] 🧹 Closing pool connections...")
        pool.close([NOAUTH_RELAY])
      }
    }
  }

  const handleBack = () => {
    setLoginMethod("idle")
    setConnectionState("idle")
    setError("")
    setNsecInput("")
    setCopied(false)
    setGeneratedKeys(null)
    setShowRelayManager(false)
    setShowPasswordSetup(false)
    setMasterPassword("")
    setConfirmPassword("")
    setShowPassword(false)
    setGeneratedAuthData(null)
    setBunkerUri("")
    setUserPubkey("")
  }

  const handleCopyKey = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error("[v0] Failed to copy:", err)
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
                  onClick={handleRemoteSignerLogin}
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

            {loginMethod === "remote" && (
              <div className="space-y-4">
                {connectionState === "generating" && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground">Generating secure connection...</p>
                  </div>
                )}

                {connectionState === "waiting" && bunkerUri && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-center text-foreground">Approve Login</h2>
                    <p className="text-center text-sm text-muted-foreground">
                      Scan with a Bunker-compatible app like Nsec.app to connect.
                    </p>
                    <div className="p-4 bg-background rounded-lg flex items-center justify-center">
                      <QRCodeSVG value={bunkerUri} size={256} level="M" />
                    </div>
                    <a
                      href={bunkerUri}
                      className="block w-full text-center p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold transition-colors"
                    >
                      Open in Signing App
                    </a>
                    <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Waiting for approval...</span>
                    </div>
                    <button
                      onClick={handleBack}
                      className="w-full text-center text-muted-foreground hover:text-foreground text-sm"
                    >
                      ← Back
                    </button>
                  </div>
                )}

                {connectionState === "success" && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-accent mx-auto mb-4" />
                    <p className="text-foreground font-medium mb-2">Connection Successful!</p>
                    <p className="text-muted-foreground text-sm">Welcome back.</p>
                    {userPubkey && (
                      <p className="text-xs text-muted-foreground font-mono break-all bg-muted p-2 rounded-md mt-4">
                        {userPubkey}
                      </p>
                    )}
                  </div>
                )}

                {connectionState === "error" && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                      <p className="text-destructive mb-4">{error}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleBack}
                        className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRemoteSignerLogin}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
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
