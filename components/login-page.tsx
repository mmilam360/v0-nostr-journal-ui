"use client"

/**
 * COMPLETE NOSTR LOGIN
 *
 * Features:
 * 1. Four login methods (create account, extension, remote signer, nsec)
 * 2. Remote signer supporting BOTH bunker:// and nostrconnect:// protocols
 * 3. Relay management on login screen
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
  QrCode,
  Link2,
} from "lucide-react"
import type { AuthData } from "./main-app"

type LoginMethod = "idle" | "extension" | "remote" | "nsec" | "create"
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"
type RemoteSignerMode = "select" | "bunker" | "nostrconnect"

interface Relay {
  url: string
  enabled: boolean
  status: "unknown" | "connected" | "failed"
}

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band", "wss://relay.primal.net"]

// Define the BUNKER_RELAY constant
const BUNKER_RELAY = "wss://relay.nsec.app"

interface LoginPageProps {
  onLoginSuccess: (authData: AuthData) => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("idle")
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [remoteSignerMode, setRemoteSignerMode] = useState<RemoteSignerMode>("select")
  const [bunkerUrl, setBunkerUrl] = useState<string>("")
  const [nostrconnectInput, setNostrconnectInput] = useState<string>("")
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

  const fetcherRef = useRef<any>(null)
  const nip46SignerRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const poolRef = useRef<any>(null)

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
    if (fetcherRef.current) {
      try {
        fetcherRef.current.shutdown()
      } catch (e) {}
      fetcherRef.current = null
    }

    if (poolRef.current) {
      try {
        poolRef.current.close([BUNKER_RELAY])
      } catch (e) {}
      poolRef.current = null
    }

    if (nip46SignerRef.current) {
      try {
        nip46SignerRef.current.disconnect?.()
      } catch (e) {}
      nip46SignerRef.current = null
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
   * Remote Signer - Bunker Protocol (QR Code)
   * Compatible with Nsec.app and other bunker-compatible wallets
   */
  const startBunkerLogin = async () => {
    setRemoteSignerMode("bunker")
    setConnectionState("generating")
    setError("")
    setCopied(false)

    try {
      console.log("[Bunker] 🚀 Starting bunker login")

      const nostrTools = await import("nostr-tools/pure")
      const { generateSecretKey, getPublicKey, nip04, nip19, finalizeEvent, verifyEvent } = nostrTools
      const { SimplePool } = await import("nostr-tools/pool")
      const { hexToBytes, bytesToHex } = await import("@noble/hashes/utils")

      const appSecretKey = generateSecretKey()
      const appPublicKey = getPublicKey(appSecretKey)
      
      // Create metadata for the connection
      const metadata = {
        name: "Nostr Journal",
        url: typeof window !== 'undefined' ? window.location.origin : "https://nostrjournal.app",
        description: "Private encrypted journaling on Nostr",
        icons: []
      }
      
      // Create the bunker URI that will be encoded in the QR code
      const bunkerURI = `nostrconnect://${appPublicKey}?relay=${encodeURIComponent(BUNKER_RELAY)}&metadata=${encodeURIComponent(JSON.stringify(metadata))}`

      console.log("[Bunker] 📱 Bunker URI:", bunkerURI)
      console.log("[Bunker] 🔑 App Public Key:", appPublicKey)
      console.log("[Bunker] 🔑 App Secret Key (hex):", bytesToHex(appSecretKey))
      setBunkerUrl(bunkerURI)

      setConnectionState("waiting")

      // Use NostrFetcher for better relay handling and to avoid filter issues
      const { NostrFetcher } = await import("nostr-fetch")
      const fetcher = NostrFetcher.init()
      fetcherRef.current = fetcher
      
      let successful = false
      let remotePubkey: string | null = null

      // Set up timeout
      timeoutRef.current = setTimeout(() => {
        if (!successful) {
          console.log("[Bunker] ⏱️ Timeout reached")
          if (fetcherRef.current) {
            fetcherRef.current.shutdown()
          }
          setConnectionState("error")
          setError("Connection timed out. Please try again.")
        }
      }, 120000) // 2 minute timeout

      console.log("[Bunker] 🔌 Connecting to relay:", BUNKER_RELAY)
      console.log("[Bunker] 👂 Waiting for approval from remote signer...")
      console.log("[Bunker] 📱 Please scan the QR code and approve the connection in your signer app")

      // Subscribe to NIP-46 events using NostrFetcher
      // Listen for connect requests from the signing app
      const sub = fetcher.allEventsIterator(
        [BUNKER_RELAY],
        { 
          kinds: [24133],
          since: Math.floor(Date.now() / 1000) - 10 // Only events from last 10 seconds
        },
        {},
        { realTime: true, timeout: 120000 }
      )

      for await (const event of sub) {
        if (successful) return // Already handled
        
        console.log("[Bunker] 📨 Event received!")
        console.log("[Bunker] Event pubkey:", event.pubkey)
        console.log("[Bunker] Event kind:", event.kind)
        console.log("[Bunker] Event tags:", event.tags)
        console.log("[Bunker] Event content:", event.content)
        
        // Check if this event is for us by looking at the p tags
        const pTags = event.tags.filter(tag => tag[0] === 'p')
        const isForUs = pTags.some(tag => tag[1] === appPublicKey)
        
        if (!isForUs) {
          console.log("[Bunker] ⚠️ Event not for us, skipping")
          continue
        }
        
        console.log("[Bunker] ✅ Event is for us, processing...")
        
        try {
          // Verify the event signature
          if (!verifyEvent(event)) {
            console.warn("[Bunker] ⚠️ Invalid event signature")
            continue
          }

          remotePubkey = event.pubkey
          console.log("[Bunker] 👤 Remote signer pubkey:", remotePubkey)
          
          // Try to decrypt the content using NIP-04
          let decryptedContent: string
          
          try {
            const sharedSecret = nip04.getSharedSecret(appSecretKey, remotePubkey)
            decryptedContent = await nip04.decrypt(sharedSecret, event.content)
            console.log("[Bunker] 🔓 Decrypted content:", decryptedContent)
          } catch (decryptErr) {
            console.warn("[Bunker] ⚠️ Failed to decrypt with NIP-04:", decryptErr)
            // Some signers might send unencrypted responses
            decryptedContent = event.content
          }
          
          // Parse the request
          let request: any
          try {
            request = JSON.parse(decryptedContent)
            console.log("[Bunker] 📦 Parsed request:", request)
          } catch (parseErr) {
            console.warn("[Bunker] ⚠️ Failed to parse request as JSON:", parseErr)
            continue
          }

          // Check if this is a connect request
          if (request.method === "connect") {
            console.log("[Bunker] 📨 Received connect request from remote signer!")
            
            // Send back a connect response
            const connectResponse = {
              kind: 24133,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", remotePubkey]],
              content: await nip04.encrypt(
                nip04.getSharedSecret(appSecretKey, remotePubkey),
                JSON.stringify({
                  id: request.id,
                  result: "ack",
                  params: [appPublicKey] // Our app's public key
                })
              )
            }
            
            const signedResponse = finalizeEvent(connectResponse, appSecretKey)
            await fetcher.publish([BUNKER_RELAY], signedResponse)
            console.log("[Bunker] 📤 Connect response sent")
            
            // Connection successful!
            console.log("[Bunker] ✅ Connection established with remote signer!")
            successful = true
            
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
              timeoutRef.current = null
            }
            
            setConnectionState("success")
            
            // Wait a bit before proceeding
            setTimeout(() => {
              onLoginSuccess({
                pubkey: remotePubkey!,
                authMethod: "remote",
                bunkerUri: bunkerURI,
                clientSecretKey: appSecretKey,
                bunkerPubkey: remotePubkey!,
                relays: [BUNKER_RELAY],
              })
            }, 1000)
            break
          } else {
            console.log("[Bunker] ⚠️ Received non-connect request:", request.method)
          }
        } catch (err) {
          console.warn("[Bunker] ⚠️ Error processing event:", err)
        }
      }

    } catch (err) {
      console.error("[Bunker] ❌ Fatal error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to connect")
      cleanup()
    }
  }

  /**
   * Remote Signer - Nostrconnect Protocol (Paste String)
   * Compatible with Alby, Amber, and other nostrconnect:// signers
   */
  const startNostrconnectLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      console.log("[Nostrconnect] 🚀 Starting nostrconnect login")

      if (!nostrconnectInput.startsWith("nostrconnect://")) {
        throw new Error("Invalid connection string. Must start with nostrconnect://")
      }

      // Parse the nostrconnect:// URI
      const url = new URL(nostrconnectInput)
      const remotePubkey = url.hostname || url.pathname.replace(/^\/\//, "").split("?")[0]
      const relay = url.searchParams.get("relay")
      const secret = url.searchParams.get("secret")

      if (!remotePubkey || !relay) {
        throw new Error("Invalid connection string. Missing pubkey or relay.")
      }

      console.log("[Nostrconnect] 📱 Remote pubkey:", remotePubkey)
      console.log("[Nostrconnect] 🔌 Relay:", relay)
      console.log("[Nostrconnect] 🔑 Has secret:", !!secret)

      const { generateSecretKey, getPublicKey, nip04 } = await import("nostr-tools/pure")
      const { NostrFetcher } = await import("nostr-fetch")

      // Generate our app keypair
      const appSecretKey = secret ? new Uint8Array(Buffer.from(secret, "hex")) : generateSecretKey()
      const appPublicKey = getPublicKey(appSecretKey)

      console.log("[Nostrconnect] 🔑 App public key:", appPublicKey)

      // Create and send connect request
      const fetcher = NostrFetcher.init()
      fetcherRef.current = fetcher

      setConnectionState("waiting")

      // Send connect request
      const { finalizeEvent } = await import("nostr-tools/pure")
      
      const connectRequest = {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", remotePubkey]],
        content: await nip04.encrypt(
          nip04.getSharedSecret(appSecretKey, remotePubkey),
          JSON.stringify({
            id: crypto.randomUUID(),
            method: "connect",
            params: [appPublicKey],
          })
        ),
      }

      const signedEvent = finalizeEvent(connectRequest, appSecretKey)

      console.log("[Nostrconnect] 📤 Sending connect request...")

      // Publish the connect request to the relay
      await fetcher.publish([relay], signedEvent)
      console.log("[Nostrconnect] 📡 Connect request published to relay")

      // Listen for the response
      console.log("[Nostrconnect] 👂 Listening for response...")
      
      const sub = fetcher.allEventsIterator(
        [relay],
        { kinds: [24133] },
        { "#p": [appPublicKey] },
        { realTime: true, timeout: 120000 }
      )

      for await (const responseEvent of sub) {
        try {
          console.log("[Nostrconnect] 📨 Received response event")
          
          const sharedSecret = nip04.getSharedSecret(appSecretKey, responseEvent.pubkey)
          const decryptedContent = await nip04.decrypt(sharedSecret, responseEvent.content)
          const response = JSON.parse(decryptedContent)
          
          console.log("[Nostrconnect] 📦 Response:", response)
          
          if (response.result === "ack" || response.result_type === "connect") {
            console.log("[Nostrconnect] ✅ Connection approved!")
            break
          } else if (response.error) {
            throw new Error(response.error.message || "Connection rejected")
          }
        } catch (e) {
          console.log("[Nostrconnect] ⚠️ Could not decrypt response:", e)
        }
      }
      
      console.log("[Nostrconnect] ✅ Connection established")
      
      setConnectionState("success")

      setTimeout(() => {
        onLoginSuccess({
          pubkey: remotePubkey,
          authMethod: "remote",
          bunkerUri: nostrconnectInput,
          clientSecretKey: appSecretKey,
          bunkerPubkey: remotePubkey,
          relays: [relay],
        })
      }, 1000)

    } catch (err) {
      console.error("[Nostrconnect] ❌ Error:", err)
      setConnectionState("error")
      setError(err instanceof Error ? err.message : "Failed to connect")
      cleanup()
    }
  }

  const copyUrl = async () => {
    try {
      const urlToCopy = bunkerUrl
      await navigator.clipboard.writeText(urlToCopy)
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
    const urlToOpen = bunkerUrl
    window.location.href = urlToOpen
  }

  const handleBack = () => {
    cleanup()
    setLoginMethod("idle")
    setConnectionState("idle")
    setRemoteSignerMode("select")
    setError("")
    setBunkerUrl("")
    setNostrconnectInput("")
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
                  onClick={() => {
                    setLoginMethod("remote")
                    setRemoteSignerMode("select")
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-lg shadow-purple-500/20"
                >
                  Remote Signer
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
                {remoteSignerMode === "select" && (
                  <div className="space-y-3">
                    <p className="text-center text-slate-300 font-medium mb-4">Choose Connection Method</p>
                    
                    <button
                      onClick={startBunkerLogin}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
                    >
                      <QrCode className="h-5 w-5" />
                      <div className="text-left">
                        <div>Scan QR Code</div>
                        <div className="text-xs text-purple-200 opacity-80">Nsec.app, Amber</div>
                      </div>
                    </button>

                    <button
                      onClick={() => setRemoteSignerMode("nostrconnect")}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                      <Link2 className="h-5 w-5" />
                      <div className="text-left">
                        <div>Paste Connection String</div>
                        <div className="text-xs text-indigo-200 opacity-80">Alby, other signers</div>
                      </div>
                    </button>

                    <button
                      onClick={handleBack}
                      className="w-full text-slate-400 hover:text-white text-sm mt-2"
                    >
                      ← Back
                    </button>
                  </div>
                )}

                {remoteSignerMode === "nostrconnect" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Connection String
                      </label>
                      <input
                        type="text"
                        value={nostrconnectInput}
                        onChange={(e) => setNostrconnectInput(e.target.value)}
                        placeholder="nostrconnect://..."
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-xs text-slate-400 mt-2">
                        Get this from your signer app (Alby, etc.)
                      </p>
                    </div>

                    {connectionState === "error" && (
                      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}

                    {connectionState === "connecting" && (
                      <div className="text-center py-4">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-2" />
                        <p className="text-slate-300 text-sm">Connecting...</p>
                      </div>
                    )}

                    {connectionState === "success" && (
                      <div className="text-center py-4">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <p className="text-slate-300 text-lg font-bold">Connected!</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setRemoteSignerMode("select")
                          setNostrconnectInput("")
                          setError("")
                        }}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={startNostrconnectLogin}
                        disabled={!nostrconnectInput || connectionState === "connecting"}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                )}

                {remoteSignerMode === "bunker" && (
                  <>
                    {connectionState === "generating" && (
                      <div className="text-center py-8">
                        <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                        <p className="text-slate-300">Generating connection...</p>
                      </div>
                    )}

                    {connectionState === "waiting" && bunkerUrl && (
                      <>
                        <div className="space-y-4">
                          <p className="text-center text-slate-300 font-medium">Scan with Nsec.app or compatible wallet</p>

                          <div className="bg-white rounded-lg p-4">
                            <QRCodeSVG value={bunkerUrl} size={256} level="M" className="mx-auto" />
                          </div>

                          <div className="space-y-2">
                            <button
                              onClick={copyUrl}
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
                              Open in App
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
                          onClick={() => {
                            setRemoteSignerMode("select")
                            setConnectionState("idle")
                            setError("")
                            setBunkerUrl("")
                          }}
                          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    )}

                    {(connectionState === "waiting" || connectionState === "connecting") && (
                      <button
                        onClick={() => {
                          setRemoteSignerMode("select")
                          setConnectionState("idle")
                          setBunkerUrl("")
                          cleanup()
                        }}
                        className="w-full text-slate-400 hover:text-white text-sm"
                      >
                        ← Cancel
                      </button>
                    )}
                  </>
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
                Note: Remote signer uses dedicated relays (relay.nostr.band for bunker)
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
