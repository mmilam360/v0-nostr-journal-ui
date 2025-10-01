"use client"

/**
 * CORRECT NIP-46 CLIENT-INITIATED FLOW
 *
 * Flow:
 * 1. Client generates nostrconnect:// URL with client pubkey
 * 2. User scans with Nsec.app
 * 3. Nsec.app sends connect REQUEST (method: "connect")
 * 4. Client sends RESPONSE with user pubkey (result: user-pubkey)
 * 5. Complete!
 *
 * The key insight: Nsec.app sends a REQUEST, we send a RESPONSE
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, AlertCircle, CheckCircle2, KeyRound } from "lucide-react"
import type { AuthData } from "./main-app"

interface NostrEvent {
  id?: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig?: string
}

type LoginMethod = "idle" | "extension" | "remote" | "nsec"
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

  // Refs for remote signer
  const poolRef = useRef<any>(null)
  const subRef = useRef<any>(null)
  const localSecretRef = useRef<Uint8Array | null>(null)
  const localPubkeyRef = useRef<string | null>(null)
  const remotePubkeyRef = useRef<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const nostrRef = useRef<any>(null)

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
    if (subRef.current) {
      try {
        subRef.current.close()
      } catch (e) {
        console.log("Sub already closed")
      }
      subRef.current = null
    }
    if (poolRef.current) {
      try {
        poolRef.current.close(RELAYS)
      } catch (e) {
        console.log("Pool already closed")
      }
      poolRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const initNostrTools = useCallback(async () => {
    if (nostrRef.current) return nostrRef.current

    try {
      const nostr = await import("nostr-tools")
      nostrRef.current = nostr
      console.log("✅ nostr-tools loaded")
      return nostr
    } catch (err) {
      console.error("❌ Failed to load nostr-tools:", err)
      throw new Error("Failed to initialize")
    }
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
      const nostr = await initNostrTools()

      let privateKey: Uint8Array

      if (nsecInput.startsWith("nsec1")) {
        const decoded = nostr.nip19.decode(nsecInput)
        if (decoded.type !== "nsec") throw new Error("Invalid nsec")
        privateKey = decoded.data
      } else if (nsecInput.length === 64) {
        privateKey = nostr.hexToBytes(nsecInput)
      } else {
        throw new Error("Invalid format. Use nsec1... or 64-char hex")
      }

      const pubkey = nostr.getPublicKey(privateKey)
      console.log("✅ Nsec login:", pubkey)

      onLoginSuccess({
        pubkey,
        nsec: nsecInput,
        authMethod: "nsec",
      })
    } catch (err) {
      console.error("Nsec error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Invalid key")
    }
  }

  /**
   * CORACLE PATTERN: Start remote signer flow
   */
  const startRemoteSignerLogin = async () => {
    setLoginMethod("remote")
    setConnectionState("generating")
    setError("")
    remotePubkeyRef.current = null

    try {
      const nostr = await initNostrTools()

      // Generate ephemeral keypair
      const localSecret = nostr.generateSecretKey()
      const localPubkey = nostr.getPublicKey(localSecret)

      localSecretRef.current = localSecret
      localPubkeyRef.current = localPubkey

      console.log("🔑 Client pubkey:", localPubkey)

      // Create nostrconnect URL
      const metadata = {
        name: "Nostr Journal",
        url: typeof window !== "undefined" ? window.location.origin : "",
        description: "Private encrypted journal",
      }

      const encodedMetadata = encodeURIComponent(JSON.stringify(metadata))
      const relayParams = RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join("&")
      const url = `nostrconnect://${localPubkey}?${relayParams}&metadata=${encodedMetadata}`

      console.log("📱 Connect URL:", url)
      setConnectUrl(url)
      setConnectionState("waiting")

      // Initialize pool
      const pool = new nostr.SimplePool()
      poolRef.current = pool

      const now = Math.floor(Date.now() / 1000)

      console.log("🔌 Subscribing to relays...")

      /**
       * CRITICAL: Subscribe to ALL events tagged to our pubkey
       * Coracle doesn't filter by kind initially - they accept any event
       * as a signal that the signer is ready
       */
      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [24133], // NIP-46 events
            "#p": [localPubkey],
            since: now,
          },
        ],
        {
          onevent: (event: NostrEvent) => {
            console.log("📨 ========================================")
            console.log("📨 EVENT RECEIVED!")
            console.log("From:", event.pubkey)
            console.log("Kind:", event.kind)
            console.log("Tags:", event.tags)
            console.log("Content preview:", event.content.substring(0, 50))
            console.log("========================================")

            handleReceivedEvent(event, nostr)
          },
          oneose: () => {
            console.log("✅ Connected to relays")
          },
        },
      )

      subRef.current = sub

      // Timeout
      timeoutRef.current = setTimeout(() => {
        if (connectionState !== "success") {
          console.log("⏱️ Timeout")
          setConnectionState("error")
          setError("Connection timeout. Please try again.")
          cleanup()
        }
      }, 120000)
    } catch (err) {
      console.error("❌ Init error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to initialize")
    }
  }

  /**
   * CRITICAL: Handle the connect REQUEST from Nsec.app
   */
  const handleReceivedEvent = async (event: NostrEvent, nostr: any) => {
    try {
      if (!localSecretRef.current || !localPubkeyRef.current) {
        console.error("❌ Keys not initialized")
        return
      }

      // Verify event is for us
      const pTags = event.tags.filter((tag) => tag[0] === "p")
      const isForUs = pTags.some((tag) => tag[1] === localPubkeyRef.current)

      if (!isForUs) {
        console.log("⚠️ Event not for us")
        return
      }

      console.log("🔓 Decrypting request from signer...")

      // Decrypt the request
      const decrypted = await nostr.nip44.decrypt(localSecretRef.current, event.pubkey, event.content)

      console.log("📋 Decrypted:", decrypted)

      const request = JSON.parse(decrypted)
      console.log("📦 Request:", request)

      /**
       * CRITICAL: Check if this is a "connect" REQUEST from the signer
       */
      if (request.method === "connect") {
        console.log("🎯 This is a CONNECT REQUEST from Nsec.app!")
        console.log("🔄 Changing to CONNECTING state")
        setConnectionState("connecting")

        // The signer is asking US for the user's pubkey
        // We respond with the signer's own pubkey (they're the user!)
        const userPubkey = event.pubkey

        console.log("✅ User pubkey is the signer pubkey:", userPubkey)

        // Send response with the user's pubkey
        await sendConnectResponse(nostr, event.pubkey, request.id, userPubkey)

        // Success!
        console.log("✅ ========================================")
        console.log("✅ CONNECTION COMPLETE!")
        console.log("✅ User pubkey:", userPubkey)
        console.log("✅ ========================================")

        setConnectionState("success")

        setTimeout(() => {
          onLoginSuccess({
            pubkey: userPubkey,
            remotePubkey: event.pubkey,
            authMethod: "remote",
          })
          cleanup()
        }, 1000)
      } else {
        console.log("⚠️ Unexpected method:", request.method)
      }
    } catch (err) {
      console.error("❌ Failed to handle signer request:", err)
      console.error("Stack:", err instanceof Error ? err.stack : "")
      setConnectionState("error")
      setError("Failed to process signer request")
      cleanup()
    }
  }

  /**
   * Send response to Nsec.app's connect request
   */
  const sendConnectResponse = async (nostr: any, signerPubkey: string, requestId: string, userPubkey: string) => {
    if (!localSecretRef.current || !localPubkeyRef.current) {
      console.error("❌ Keys not initialized")
      return
    }

    try {
      console.log("📤 ========================================")
      console.log("📤 SENDING CONNECT RESPONSE")
      console.log("To signer:", signerPubkey)
      console.log("Request ID:", requestId)
      console.log("User pubkey:", userPubkey)
      console.log("========================================")

      // Response payload
      const response = {
        id: requestId, // MUST match the request ID
        result: userPubkey, // The user's pubkey
      }

      console.log("📋 Response:", response)

      // Encrypt
      const encrypted = await nostr.nip44.encrypt(localSecretRef.current, signerPubkey, JSON.stringify(response))

      console.log("🔐 Encrypted")

      // Create event
      const unsignedEvent = {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", signerPubkey]],
        content: encrypted,
        pubkey: localPubkeyRef.current,
      }

      const signedEvent = await nostr.finalizeEvent(unsignedEvent, localSecretRef.current)

      console.log("✍️ Signed")

      // Publish
      if (poolRef.current) {
        await poolRef.current.publish(RELAYS, signedEvent)
        console.log("✅ RESPONSE PUBLISHED")
      }
    } catch (err) {
      console.error("❌ Failed to send response:", err)
      throw err
    }
  }

  const handleBack = () => {
    cleanup()
    setLoginMethod("idle")
    setConnectionState("idle")
    setError("")
    setConnectUrl("")
    setNsecInput("")
  }

  return (
    <div style={containerStyle} className="bg-slate-900">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Nostr Journal</h1>
            <p className="text-slate-400">Private encrypted journaling</p>
          </div>

          <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
            {/* Method Selection */}
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

                <p className="text-xs text-slate-400 text-center mt-4">Your keys never leave your device</p>
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

            {/* Remote Signer Flow */}
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
                    <p className="text-slate-400 text-sm">Establishing secure link</p>
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
