'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Smartphone, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  HelpCircle,
  Copy,
  CheckCircle,
  AlertTriangle,
  Key,
  Radio,
  Settings,
  Loader2,
  QrCode,
  Link2,
  Link,
  ArrowLeft,
  Eye,
  EyeOff,
  Check
} from 'lucide-react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import RemoteSignerConnect from './remote-signer-connect'
import { bytesToHex } from '@noble/hashes/utils'
import { QRCodeSVG } from 'qrcode.react'
import InfoModal from './info-modal'
import { Logo } from './logo'

interface LoginPageHorizontalProps {
  onLoginSuccess: (authData: any) => void
}

interface GeneratedKeys {
  secretKey: Uint8Array
  publicKey: string
  nsec: string
  npub: string
}

type LoginStep = 'choose' | 'method' | 'connect' | 'complete'
type ConnectionState = "idle" | "generating" | "waiting" | "connecting" | "success" | "error"
type RemoteSignerMode = "select" | "bunker" | "nostrconnect"

export default function LoginPageHorizontal({ onLoginSuccess }: LoginPageHorizontalProps) {
  const [currentStep, setCurrentStep] = useState<LoginStep>('choose')
  const [selectedPath, setSelectedPath] = useState<'existing' | 'new' | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'extension' | 'remote' | 'nsec' | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  // Plebeian Market style bunker connection
  const handleBunkerConnect = async () => {
    if (!bunkerUrl) return

    setConnectionState('connecting')
    setError('')

    try {
      console.log('[BunkerConnect] 🔌 Starting Plebeian Market style connection...')
      console.log('[BunkerConnect] 📱 Bunker URL:', bunkerUrl.substring(0, 50) + '...')

      // Generate client keypair if not already done
      let appSecretKey: Uint8Array
      if (sessionKeypair?.appSecretKey) {
        appSecretKey = sessionKeypair.appSecretKey
      } else {
        const { generateSecretKey } = await import("nostr-tools/pure")
        appSecretKey = generateSecretKey()
      }

      // Use Plebeian Market's approach with BunkerSigner.fromURI
      const { BunkerSigner } = await import("nostr-tools/nip46")
      const { SimplePool } = await import("nostr-tools/pool")

      console.log('[BunkerConnect] 🔑 Using BunkerSigner.fromURI...')
      
      const pool = new SimplePool()
      
      // This is the key - use BunkerSigner.fromURI like Plebeian Market
      const signer = await BunkerSigner.fromURI(
        appSecretKey,
        bunkerUrl,
        {
          pool,
          timeout: 60000  // 60 seconds timeout
        }
      )

      console.log('[BunkerConnect] ✅ BunkerSigner connected!')

      // Get the user's public key
      const userPubkey = await signer.getPublicKey()
      console.log('[BunkerConnect] 👤 Got user pubkey:', userPubkey)

      setConnectionState('success')

      // Convert Uint8Array to hex string for storage
      const clientSecretKeyHex = Array.from(appSecretKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // Call success callback with Plebeian Market style data
      setTimeout(() => {
        onLoginSuccess({
          pubkey: userPubkey,
          authMethod: 'remote',
          clientSecretKey: clientSecretKeyHex,
          bunkerUri: bunkerUrl,
          bunkerPubkey: userPubkey,
          relays: ['wss://relay.nostr.band', 'wss://relay.damus.io', 'wss://nos.lol']
        })
      }, 1500)

    } catch (error) {
      console.error('[BunkerConnect] ❌ Connection failed:', error)
      setConnectionState('error')
      
      let errorMsg = 'Failed to connect. '
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMsg += 'Connection timed out. Ensure your signing app is open and connected to the internet.'
        } else if (error.message.includes('relay')) {
          errorMsg += 'Could not connect to relay. Check your internet connection.'
        } else if (error.message.includes('secret')) {
          errorMsg += 'Invalid bunker URL or secret. Please generate a new one in your signing app.'
        } else {
          errorMsg += error.message
        }
      } else {
        errorMsg += 'Unknown error occurred.'
      }
      
      setError(errorMsg)
    }
  }
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null)
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false)
  
  // Login functionality states
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [error, setError] = useState<string>("")
  const [remoteSignerMode, setRemoteSignerMode] = useState<RemoteSignerMode>("select")
  const [bunkerUrl, setBunkerUrl] = useState<string>("")
  const [nostrconnectInput, setNostrconnectInput] = useState<string>("")
  const [nsecInput, setNsecInput] = useState<string>("")
  const [showNsec, setShowNsec] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // Cache keypair for session to avoid generating new npub each time
  const [sessionKeypair, setSessionKeypair] = useState<{
    appSecretKey: Uint8Array
    appPublicKey: string
    secret: string
  } | null>(null)
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const steps: LoginStep[] = ['choose', 'method', 'connect', 'complete']
  const currentStepIndex = steps.indexOf(currentStep)

  // Navigation functions
  const goNext = () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex])
    }
  }

  const goBack = () => {
    // Handle remote signer mode changes first
    if (remoteSignerMode === 'bunker' || remoteSignerMode === 'nostrconnect') {
      setRemoteSignerMode('select')
      setConnectionState('idle')
      setError('')
      setBunkerUrl('')
      setNostrconnectInput('')
      // Clear session keypair when going back from remote signer modes
      setSessionKeypair(null)
      return
    }
    
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex])
      // Clear session keypair when going back to previous steps
      if (prevIndex <= 1) { // Going back to 'choose' or 'method'
        setSessionKeypair(null)
      }
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 'choose':
        return selectedPath !== null
      case 'method':
        return selectedPath === 'new' || selectedMethod !== null
      case 'connect':
        return true // This step handles the actual connection
      case 'complete':
        return true
      default:
        return false
    }
  }

  const generateNewKeypair = () => {
    const secretKey = generateSecretKey()
    const publicKey = getPublicKey(secretKey)
    const nsec = nip19.nsecEncode(secretKey)
    const npub = nip19.npubEncode(publicKey)

    setGeneratedKeys({
      secretKey,
      publicKey,
      nsec,
      npub
    })
    
    // Move to the next step to show the keys
    setCurrentStep('connect')
  }

  const completeAccountCreation = () => {
    if (!generatedKeys) return

    onLoginSuccess({
      pubkey: generatedKeys.publicKey,
      authMethod: "nsec",
      privateKey: bytesToHex(generatedKeys.secretKey),
      nsec: generatedKeys.nsec
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Extension login function
  const handleExtensionLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      if (!window.nostr) {
        throw new Error("No Nostr extension found. Please install Alby or nos2x.")
      }

      const pubkey = await window.nostr.getPublicKey()
      
      onLoginSuccess({
        pubkey,
        authMethod: "extension",
        privateKey: null
      })
    } catch (err: any) {
      console.error("Extension login failed:", err)
      setError(err.message || "Extension login failed")
      setConnectionState("error")
    }
  }

  // Nsec login function
  const handleNsecLogin = async () => {
    setConnectionState("connecting")
    setError("")

    try {
      const { getPublicKey } = await import("nostr-tools/pure")
      const { bytesToHex } = await import("@noble/hashes/utils")
      const { decode } = await import('nostr-tools/nip19')

      let privateKey: Uint8Array
      let privateKeyHex: string

      if (nsecInput.startsWith("nsec1")) {
        const decoded = decode(nsecInput)
        if (decoded.type !== "nsec") throw new Error("Invalid nsec format")
        privateKey = decoded.data as Uint8Array
      } else {
        // Assume it's hex
        privateKey = new Uint8Array(Buffer.from(nsecInput, "hex"))
      }

      privateKeyHex = bytesToHex(privateKey)
      const pubkey = getPublicKey(privateKey)

      onLoginSuccess({
        pubkey,
        authMethod: "nsec",
        privateKey: privateKeyHex,
        nsec: nsecInput
      })
    } catch (err: any) {
      console.error("Nsec login failed:", err)
      setError(err.message || "Invalid private key")
      setConnectionState("error")
    }
  }

  // Handle connection string (both bunker:// and nostrconnect://)
  const handleConnectionString = async (connectionString: string) => {
    setRemoteSignerMode("nostrconnect")
    setConnectionState("generating")
    setError("")
    setCopied(false)
    
    // Clear any existing session keypair to start fresh
    setSessionKeypair(null)

    try {
      console.log("[NostrConnect] 🚀 Starting connection string login")
      console.log("[NostrConnect] 📱 Connection string:", connectionString)

      // Add delay to give user time to get back to our app
      console.log("[NostrConnect] ⏱️ Waiting 3 seconds for user to return to app...")
      await new Promise(resolve => setTimeout(resolve, 3000))

      const { generateSecretKey, getPublicKey, nip04, finalizeEvent, verifyEvent } = await import("nostr-tools/pure")
      const { bytesToHex } = await import("@noble/hashes/utils")

      // Use cached keypair or generate new one for this session
      let appSecretKey: Uint8Array
      let appPublicKey: string
      let secret: string
      
      if (sessionKeypair) {
        console.log("[NostrConnect] 🔄 Reusing cached keypair for session")
        appSecretKey = sessionKeypair.appSecretKey
        appPublicKey = sessionKeypair.appPublicKey
        secret = sessionKeypair.secret
      } else {
        console.log("[NostrConnect] 🔑 Generating new keypair for session")
        appSecretKey = generateSecretKey()
        appPublicKey = getPublicKey(appSecretKey)
        
        // CRITICAL: Generate a secret token to prevent connection spoofing
        const secretBytes = crypto.getRandomValues(new Uint8Array(16))
        secret = bytesToHex(secretBytes)
        
        // Cache the keypair for this session
        setSessionKeypair({
          appSecretKey,
          appPublicKey,
          secret
        })
      }

      // Parse the connection string
      let remotePubkey: string
      let relay: string
      
      if (connectionString.startsWith('bunker://')) {
        // Parse bunker:// format
        const url = new URL(connectionString)
        remotePubkey = url.hostname
        relay = url.searchParams.get('relay') || 'wss://relay.nsec.app'
      } else if (connectionString.startsWith('nostrconnect://')) {
        // Parse nostrconnect:// format
        const url = new URL(connectionString)
        remotePubkey = url.hostname
        relay = url.searchParams.get('relay') || 'wss://relay.nsec.app'
      } else {
        throw new Error('Invalid connection string format. Must start with bunker:// or nostrconnect://')
      }

      console.log("[NostrConnect] 🔑 Remote pubkey:", remotePubkey)
      console.log("[NostrConnect] 🔌 Relay:", relay)

      // Create and send connect request
      const connectRequest = {
        kind: 24133,
        pubkey: appPublicKey,
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

      console.log("[NostrConnect] 📤 Sending connect request...")
      
      // Use WebSocket to send the event and wait for response
      let ws: WebSocket | null = null
      let isConnected = false
      
      const cleanup = () => {
        if (ws) {
          try {
            ws.close()
          } catch (e) {}
        }
        ws = null
      }

      // Set timeout for connection (120 seconds for mobile compatibility with app switching)
      const timeoutId = setTimeout(() => {
        if (!isConnected) {
          console.log("[NostrConnect] ⏱️ Connection timeout")
          setConnectionState("error")
          setError("Connection timed out. Please try again or check your internet connection.")
          cleanup()
        }
      }, 120000)

      // Connect to relay
      console.log("[NostrConnect] 🔌 Connecting to relay...")
      ws = new WebSocket(relay)

      ws.onerror = (error) => {
        console.error("[NostrConnect] ❌ WebSocket error:", error)
        if (!isConnected) {
          setConnectionState("error")
          setError("Failed to connect to relay. Please check your internet connection and try again.")
          clearTimeout(timeoutId)
          cleanup()
        }
      }

      ws.onopen = () => {
        console.log("[NostrConnect] ✅ WebSocket connected")
        
        // Subscribe to NIP-46 events tagged with our pubkey
        const subscriptionId = crypto.randomUUID()
        const subscription = [
          "REQ",
          subscriptionId,
          {
            kinds: [24133],
            "#p": [appPublicKey],
            since: Math.floor(Date.now() / 1000) - 10 // Only get events from last 10 seconds
          }
        ]
        
        const subMessage = JSON.stringify(subscription)
        console.log("[NostrConnect] 📤 Subscribing to NIP-46 events")
        ws.send(subMessage)
        
        // Send the connect request
        const eventMessage = JSON.stringify(["EVENT", signedEvent])
        console.log("[NostrConnect] 📤 Sending connect request event")
        ws.send(eventMessage)
      }

      ws.onmessage = async (message) => {
        try {
          const data = JSON.parse(message.data)
          console.log("[NostrConnect] 📱 Received message:", data[0])
          
          if (data[0] === "EVENT" && data[2] && !isConnected) {
            const event = data[2]
            
            if (event.kind !== 24133) return
            
            console.log("[NostrConnect] 📨 Received NIP-46 event from:", event.pubkey)
            
            if (event.pubkey !== remotePubkey) {
              console.log("[NostrConnect] ⚠️ Event from different pubkey, ignoring")
              return
            }

            try {
              const sharedSecret = nip04.getSharedSecret(appSecretKey, event.pubkey)
              const decryptedContent = await nip04.decrypt(sharedSecret, event.content)
              const response = JSON.parse(decryptedContent)
              
              console.log("[NostrConnect] 🔓 Decrypted response:", response)
              
              if (response.result === "connect_approved") {
                console.log("[NostrConnect] ✅ Connection approved!")
                isConnected = true
                clearTimeout(timeoutId)
                cleanup()
                
                setConnectionState("success")
                
                // Success! Login with the remote signer
                onLoginSuccess({
                  pubkey: remotePubkey,
                  authMethod: 'remote',
                  clientSecretKey: appSecretKey,
                  bunkerUri: connectionString,
                  bunkerPubkey: remotePubkey,
                  relays: [relay]
                })
              } else if (response.error) {
                console.error("[NostrConnect] ❌ Connection rejected:", response.error)
                setConnectionState("error")
                setError(response.error.message || "Connection rejected")
                cleanup()
              }
            } catch (decryptError) {
              console.error("[NostrConnect] ❌ Failed to decrypt response:", decryptError)
            }
          }
        } catch (parseError) {
          console.error("[NostrConnect] ❌ Failed to parse message:", parseError)
        }
      }

    } catch (error) {
      console.error("[NostrConnect] ❌ Connection string login failed:", error)
      setConnectionState("error")
      setError(error instanceof Error ? error.message : "Connection failed")
    }
  }

  // Remote signer login function - Using working implementation from login-page.tsx
  const startBunkerLogin = async () => {
    setRemoteSignerMode("bunker")
    setConnectionState("generating")
    setError("")
    setCopied(false)
    
    // Clear any existing session keypair to start fresh
    setSessionKeypair(null)

    try {
      console.log("[NostrConnect] 🚀 Starting NIP-46 bunker login")

      const { generateSecretKey, getPublicKey, nip04, finalizeEvent, verifyEvent } = await import("nostr-tools/pure")
      // Import nip44 separately - it's in a different module
      const nip44 = await import("nostr-tools/nip44")
      const { bytesToHex } = await import("@noble/hashes/utils")

      // Use cached keypair or generate new one for this session
      let appSecretKey: Uint8Array
      let appPublicKey: string
      let secret: string
      
      if (sessionKeypair) {
        console.log("[NostrConnect] 🔄 Reusing cached keypair for session")
        appSecretKey = sessionKeypair.appSecretKey
        appPublicKey = sessionKeypair.appPublicKey
        secret = sessionKeypair.secret
      } else {
        console.log("[NostrConnect] 🔑 Generating new keypair for session")
        appSecretKey = generateSecretKey()
        appPublicKey = getPublicKey(appSecretKey)
        
        // CRITICAL: Generate a secret token to prevent connection spoofing
        const secretBytes = crypto.getRandomValues(new Uint8Array(16))
        secret = bytesToHex(secretBytes)
        
        // Cache the keypair for this session
        setSessionKeypair({
          appSecretKey,
          appPublicKey,
          secret
        })
      }
      
      // App name and perms in query string format (better compatibility)
      const appName = encodeURIComponent("Nostr Journal")
      // Comprehensive permissions for full app functionality
      const perms = encodeURIComponent("sign_event:1,sign_event:5,sign_event:30078,sign_event:31078,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt,get_public_key,get_relays")
      
      // Use nsec.app relay for better compatibility
      // Use multiple NIP-46 optimized relays for better mobile reliability
      const BUNKER_RELAYS = [
        "wss://relay.nsec.app",
        "wss://relay.damus.io", 
        "wss://nos.lol",
        "wss://relay.nostr.band"
      ]
      const BUNKER_RELAY = BUNKER_RELAYS[0] // Primary relay
      
      // Generate the nostrconnect URI with secret
      const bunkerURI = `nostrconnect://${appPublicKey}?relay=${encodeURIComponent(BUNKER_RELAY)}&secret=${secret}&name=${appName}&perms=${perms}`

      console.log("[NostrConnect] 📱 Connection URI generated with secret")
      console.log("[NostrConnect] 🔑 Local App Public Key:", appPublicKey)
      console.log("[NostrConnect] 🔐 Secret:", secret.slice(0, 8) + "...")
      console.log("[NostrConnect] 🔌 Using relay:", BUNKER_RELAY)
      console.log("[NostrConnect] 📱 Full bunker URI:", bunkerURI)
      
      setBunkerUrl(bunkerURI)
      setConnectionState("waiting")

      // Connection state tracking
      let isConnected = false
      let remotePubkey: string | null = null
      let ws: WebSocket | null = null

      // Cleanup function
      const cleanup = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.close()
          } catch (e) {}
        }
        ws = null
      }

      // Set timeout for connection (120 seconds for mobile compatibility with app switching)
      const timeoutId = setTimeout(() => {
        if (!isConnected) {
          console.log("[NostrConnect] ⏱️ Connection timeout")
          setConnectionState("error")
          setError("Connection timed out. Please try scanning the QR code again or check your internet connection.")
          cleanup()
        }
      }, 120000)

      // Connect to relay
      console.log("[NostrConnect] 🔌 Connecting to relay...")
      ws = new WebSocket(BUNKER_RELAY)

      // Add mobile-specific WebSocket handling with retry logic
      ws.onerror = (error) => {
        console.error("[NostrConnect] ❌ WebSocket error:", error)
        console.error("[NostrConnect] 📱 Mobile WebSocket error details:", {
          readyState: ws?.readyState,
          url: ws?.url,
          error: error
        })
        if (!isConnected) {
          console.log("[NostrConnect] 🔄 Attempting to reconnect...")
          // Try to reconnect after a short delay
          setTimeout(() => {
            if (!isConnected && ws?.readyState !== WebSocket.OPEN) {
              try {
                ws.close()
                ws = new WebSocket(BUNKER_RELAY)
                // Re-attach event handlers
                ws.onopen = () => {
                  console.log("[NostrConnect] ✅ Reconnected to relay")
                  // Re-subscribe and re-send connection request
                  const subscriptionId = crypto.randomUUID()
                  const subscription = [
                    "REQ",
                    subscriptionId,
                    {
                      kinds: [24133],
                      "#p": [appPublicKey],
                      since: Math.floor(Date.now() / 1000) - 10
                    }
                  ]
                  ws.send(JSON.stringify(subscription))
                }
                ws.onerror = (retryError) => {
                  console.error("[NostrConnect] ❌ Retry failed:", retryError)
                  setConnectionState("error")
                  setError("Failed to connect to relay. Please check your internet connection and try again.")
                  clearTimeout(timeoutId)
                  cleanup()
                }
              } catch (retryError) {
                console.error("[NostrConnect] ❌ Retry connection failed:", retryError)
                setConnectionState("error")
                setError("Failed to connect to relay. Please check your internet connection and try again.")
                clearTimeout(timeoutId)
                cleanup()
              }
            }
          }, 2000)
        }
      }

      // Add connection close handling for mobile
      ws.onclose = (event) => {
        console.log("[NostrConnect] 📱 WebSocket closed:", event.code, event.reason)
        if (!isConnected) {
          console.log("[NostrConnect] ⚠️ WebSocket closed before connection established")
          // Don't set error state immediately on close - mobile browsers often close/reopen connections
        }
      }

      ws.onopen = () => {
        console.log("[NostrConnect] ✅ WebSocket connected")
        console.log("[NostrConnect] 📱 Mobile connection established, ready to receive responses")
        
        // Subscribe to NIP-46 events tagged with our pubkey
        const subscriptionId = crypto.randomUUID()
        const subscription = [
          "REQ",
          subscriptionId,
          {
            kinds: [24133],
            "#p": [appPublicKey],
            since: Math.floor(Date.now() / 1000) - 10 // Only get events from last 10 seconds
          }
        ]
        
        const subMessage = JSON.stringify(subscription)
        console.log("[NostrConnect] 📤 Subscribing to NIP-46 events")
        console.log("[NostrConnect] 📱 Subscription ID:", subscriptionId)
        ws.send(subMessage)
        
        // Send ping to keep connection alive (mobile browsers often close idle connections)
        const pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN && !isConnected) {
            try {
              ws.send(JSON.stringify(["PING", subscriptionId]))
            } catch (e) {
              console.log("[NostrConnect] 📱 Ping failed:", e)
              clearInterval(pingInterval)
            }
          } else {
            clearInterval(pingInterval)
          }
        }, 30000) // Ping every 30 seconds
      }

      ws.onmessage = async (message) => {
        try {
          const data = JSON.parse(message.data)
          console.log("[NostrConnect] 📱 Received message:", data[0], data[1])
          
          // Handle PONG responses
          if (data[0] === "PONG") {
            console.log("[NostrConnect] 📱 Received PONG, connection alive")
            return
          }
          
          // Handle different message types
          if (data[0] === "EVENT" && data[2] && !isConnected) {
            const event = data[2]
            
            if (event.kind !== 24133) return
            
            console.log("[NostrConnect] 📨 Received NIP-46 event from:", event.pubkey)
            
            // Verify event signature
            const isValid = verifyEvent(event)
            if (!isValid) {
              console.warn("[NostrConnect] ⚠️ Invalid event signature - ignoring")
              return
            }

            remotePubkey = event.pubkey
            console.log("[NostrConnect] 👤 Remote signer pubkey:", remotePubkey)

            try {
              // Try NIP-44 decryption first (modern standard)
              let decryptedContent: string
              let usedNip44 = false
              
              try {
                const conversationKey = nip44.v2.utils.getConversationKey(appSecretKey, remotePubkey)
                decryptedContent = nip44.v2.decrypt(event.content, conversationKey)
                usedNip44 = true
                console.log("[NostrConnect] 🔓 Decrypted with NIP-44")
              } catch (nip44Error) {
                // Fallback to NIP-04 for older signers
                console.log("[NostrConnect] ⚠️ NIP-44 failed, trying NIP-04:", nip44Error)
                const sharedSecret = nip04.getSharedSecret(appSecretKey, remotePubkey)
                decryptedContent = await nip04.decrypt(sharedSecret, event.content)
                console.log("[NostrConnect] 🔓 Decrypted with NIP-04 (legacy)")
              }

              let response: any
              try {
                response = JSON.parse(decryptedContent)
              } catch (e) {
                console.warn("[NostrConnect] ⚠️ Response is not JSON:", decryptedContent)
                response = { result: decryptedContent }
              }

              console.log("[NostrConnect] 📦 Response:", response)

              // Handle auth_url response (web-based authentication)
              if (response.result === "auth_url" && response.error && response.error.includes('http')) {
                console.log("[NostrConnect] 🔐 Auth challenge received - opening web auth")
                const authUrl = response.error
                
                // Open auth URL in new window/tab
                const authWindow = window.open(authUrl, '_blank', 'width=500,height=600,scrollbars=yes,resizable=yes')
                
                if (authWindow) {
                  console.log("[NostrConnect] 🌐 Opened auth window:", authUrl)
                  setError("Please complete authentication in the popup window, then return here.")
                } else {
                  console.error("[NostrConnect] ❌ Failed to open auth window")
                  setError("Please allow popups and try again, or manually visit: " + authUrl)
                }
                return
              }

              // CRITICAL: Validate the secret token to prevent spoofing
              if (response.result === secret || 
                  (response.params && response.params.includes(secret))) {
                console.log("[NostrConnect] ✅ Secret validated - connection approved!")
                isConnected = true

                // Clear timeout
                clearTimeout(timeoutId)

                // Update UI to success state
                setConnectionState("success")

                // Wait for UI update, then proceed with login
                setTimeout(() => {
                  console.log("[NostrConnect] 🎉 Proceeding with login")
                  
                  // Clean up WebSocket
                  cleanup()
                  
                  // Call login success with proper auth data structure
                  onLoginSuccess({
                    pubkey: remotePubkey,
                    authMethod: 'remote',
                    clientSecretKey: appSecretKey,
                    bunkerUri: bunkerURI,
                    bunkerPubkey: remotePubkey,
                    relays: [BUNKER_RELAY]
                  })
                }, 1500)

              } else if (response.error) {
                console.error("[NostrConnect] ❌ Connection error:", response.error)
                if (!isConnected) {
                  setConnectionState("error")
                  clearTimeout(timeoutId)
                  cleanup()
                }
              } else {
                console.warn("[NostrConnect] ⚠️ Unknown response format:", response)
              }
            } catch (decryptError) {
              console.log("[NostrConnect] ⚠️ Could not decrypt event:", decryptError)
            }
          }
        } catch (parseError) {
          console.error("[NostrConnect] ❌ Failed to parse message:", parseError)
        }
      }

    } catch (err: any) {
      console.error("Bunker login failed:", err)
      setError(err.message || "Failed to generate connection")
      setConnectionState("error")
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'choose':
        return (
          <div className="space-y-8">
            <div className="text-center">
              <Logo className="h-24 w-auto mx-auto mb-8" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Use Existing Account */}
              <button
                onClick={() => {
                  setSelectedPath('existing')
                  goNext()
                }}
                className="p-8 rounded-xl border-2 border-border hover:border-primary  text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 ">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Use Existing Account</h3>
                    <p className="text-muted-foreground">Sign in with your Nostr keys</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect with browser extension, remote signer, or import your private key
                </p>
              </button>

              {/* Create New Account */}
              <button
                onClick={() => {
                  setSelectedPath('new')
                  goNext()
                }}
                className="p-8 rounded-xl border-2 border-border hover:border-primary  text-left bg-card hover:bg-card/80 group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 ">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Create New Account</h3>
                    <p className="text-muted-foreground">Get started in 30 seconds</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generate a new cryptographic key pair for your Nostr identity
                </p>
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowInfo(true)}
                className="text-primary hover:underline text-sm flex items-center gap-2 mx-auto"
              >
                <HelpCircle className="w-4 h-4" />
                What is Nostr?
              </button>
            </div>
          </div>
        )

      case 'method':
        if (selectedPath === 'new') {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Create Your Account</h2>
                <p className="text-muted-foreground">We'll generate a new cryptographic key pair for you</p>
              </div>

              <div className="max-w-md mx-auto">
                <div className="p-6 border-2 border-primary rounded-lg bg-card">
                  <h3 className="font-semibold text-lg mb-4">Generate Your Keys</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    This creates your unique Nostr identity. Your keys are generated locally and never leave your device.
                  </p>

                  <Button
                    onClick={generateNewKeypair}
                    className="w-full bg-primary hover:bg-primary/90"
                    size="lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate My Keys
                  </Button>
                </div>
              </div>
            </div>
          )
        } else {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Choose Sign-In Method</h2>
                <p className="text-muted-foreground">How would you like to connect your account?</p>
              </div>

              <div className="max-w-2xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {/* Browser Extension */}
                <button
                  onClick={() => {
                    setSelectedMethod('extension')
                    goNext()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary  text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Radio className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Browser Extension</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use Alby, nos2x, or other Nostr extensions
                  </p>
                </button>

                {/* Remote Signer */}
                <button
                  onClick={async () => {
                    setSelectedMethod('remote')
                    // Generate bunker URL immediately when selecting remote method
                    try {
                      const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure")
                      const appSecretKey = generateSecretKey()
                      const appPublicKey = getPublicKey(appSecretKey)
                      const bunkerURI = `bunker://${appPublicKey}?relay=${encodeURIComponent('wss://relay.nostr.band')}`
                      setBunkerUrl(bunkerURI)
                      setSessionKeypair({
                        appSecretKey,
                        appPublicKey,
                        secret: Math.random().toString(36).substring(2, 15)
                      })
                    } catch (error) {
                      console.error('Failed to generate bunker URL:', error)
                    }
                    goNext()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary  text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Smartphone className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Remote Signer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connect with nsec.app, Amber, or other apps
                  </p>
                </button>

                {/* Import Key */}
                <button
                  onClick={() => {
                    setSelectedMethod('nsec')
                    goNext()
                  }}
                  className="p-4 sm:p-6 rounded-lg border-2 border-border hover:border-primary  text-left bg-card hover:bg-card/80 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Key className="w-6 h-6 text-primary" />
                    <h3 className="font-semibold">Import Key</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter your private key directly
                  </p>
                </button>
                </div>
              </div>
            </div>
          )
        }

        return null

      case 'connect':
        if (selectedPath === 'new' && generatedKeys) {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">Save Your Keys</h2>
                <p className="text-muted-foreground">Important: Save these keys securely</p>
              </div>

              <div className="max-w-2xl mx-auto space-y-6">
                <div className="p-6 border-2 border-green-500 rounded-lg bg-card">
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <CheckCircle className="w-5 h-5" />
                    <h3 className="font-semibold">Keys Generated Successfully!</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Your Public Key (npub)</label>
                      <div className="flex gap-2">
                        <input
                          value={generatedKeys.npub}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-muted text-muted-foreground"
                        />
                        <Button
                          onClick={() => copyToClipboard(generatedKeys.npub)}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Share this - it's like your username
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Your Private Key (nsec)</label>
                      <div className="flex gap-2">
                        <input
                          value={generatedKeys.nsec}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded font-mono text-sm bg-muted text-muted-foreground"
                        />
                        <Button
                          onClick={() => copyToClipboard(generatedKeys.nsec)}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 mt-2">
                        <div className="flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <p className="font-medium text-yellow-800 dark:text-yellow-200">
                              Save this key securely!
                            </p>
                            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                              This is like your password. Anyone with this key can access your account.
                              Save it in a password manager or write it down.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setHasConfirmedSave(!hasConfirmedSave)}
                      className="mt-1 w-5 h-5 flex items-center justify-center border-2 border-muted-foreground rounded-sm hover:border-primary "
                    >
                      {hasConfirmedSave && (
                        <svg 
                          className="w-3 h-3 text-primary" 
                          fill="currentColor" 
                          viewBox="0 0 20 20"
                        >
                          <path 
                            fillRule="evenodd" 
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                            clipRule="evenodd" 
                          />
                        </svg>
                      )}
                    </button>
                    <label 
                      onClick={() => setHasConfirmedSave(!hasConfirmedSave)}
                      className="text-sm cursor-pointer"
                    >
                      I have saved my private key (nsec) in a secure location
                    </label>
                  </div>
                </div>

                <Button
                    onClick={completeAccountCreation}
                    disabled={!hasConfirmedSave}
                    className="w-full bg-primary mt-4"
                    size="lg"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Continue to Journal
                  </Button>
                </div>
              </div>
            </div>
          )
        }

        if (selectedPath === 'existing' && selectedMethod) {
          return (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  {selectedMethod === 'extension' && 'Connect Extension'}
                  {selectedMethod === 'remote' && 'Connect Remote Signer'}
                  {selectedMethod === 'nsec' && 'Import Private Key'}
                </h2>
                <p className="text-muted-foreground">Complete your connection</p>
              </div>

              <div className="max-w-md mx-auto">
                {selectedMethod === 'extension' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Connect with your Nostr browser extension (Alby, nos2x, etc.)
                    </p>
                    <Button 
                      onClick={handleExtensionLogin}
                      disabled={connectionState === 'connecting'}
                      className="w-full bg-primary hover:bg-primary/90"
                      size="lg"
                    >
                      {connectionState === 'connecting' ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Radio className="w-5 h-5 mr-2" />
                          Connect Extension
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {selectedMethod === 'remote' && (
                  <div className="space-y-4">
                    {/* QR Code */}
                    <div className="flex justify-center">
                      <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center p-4">
                        <QRCodeSVG 
                          value={bunkerUrl} 
                          size={180} 
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                    </div>

                    {/* Bunker URI Input */}
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        Or paste bunker:// URL:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={bunkerUrl}
                          onChange={(e) => setBunkerUrl(e.target.value)}
                          placeholder="bunker://..."
                          className="flex-1 px-3 py-2 border rounded-md bg-background text-foreground"
                        />
                        <Button
                          onClick={handleBunkerConnect}
                          disabled={!bunkerUrl || connectionState === 'connecting'}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {connectionState === 'connecting' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Connection Status */}
                    {connectionState === 'waiting' && (
                      <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Waiting for connection...</span>
                      </div>
                    )}

                    {connectionState === 'success' && (
                      <div className="flex items-center justify-center space-x-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Connected successfully!</span>
                      </div>
                    )}

                    {connectionState === 'error' && (
                      <div className="flex items-center justify-center space-x-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedMethod === 'nsec' && (
                      <div className="space-y-4">
                        <div className="text-center space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Scan this QR code with your Nostr app
                          </p>
                          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span>Waiting for connection...</span>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div className="w-40 h-40 sm:w-52 sm:h-52 bg-white p-4 rounded-lg border-2 border-gray-200">
                            {bunkerUrl && <QRCodeSVG value={bunkerUrl} size="100%" />}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={bunkerUrl}
                            readOnly
                            className="w-full px-3 py-2 text-sm border rounded font-mono bg-background text-foreground"
                          />
                          <Button
                            onClick={() => copyToClipboard(bunkerUrl)}
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Connection String
                          </Button>
                        </div>
                      </div>
                    )}

                    {remoteSignerMode === 'nostrconnect' && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          Paste the connection string from your Nostr app
                        </p>
                        <input
                          type="text"
                          placeholder="bunker://... or nostrconnect://..."
                          value={nostrconnectInput}
                          onChange={(e) => setNostrconnectInput(e.target.value)}
                          className="w-full px-3 py-2 text-sm border rounded font-mono bg-background text-foreground placeholder-muted-foreground"
                        />
                        <Button
                          onClick={() => {
                            handleConnectionString(nostrconnectInput)
                          }}
                          disabled={!nostrconnectInput.startsWith('bunker://') && !nostrconnectInput.startsWith('nostrconnect://')}
                          className="w-full"
                        >
                          Connect
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {selectedMethod === 'nsec' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Enter your private key (nsec format or hex)
                    </p>
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={showNsec ? "text" : "password"}
                          placeholder="nsec1..."
                          value={nsecInput}
                          onChange={(e) => setNsecInput(e.target.value)}
                          className="w-full px-3 py-2 pr-10 text-sm border rounded font-mono bg-background text-foreground placeholder-muted-foreground"
                        />
                        <button
                          onClick={() => setShowNsec(!showNsec)}
                          className="absolute right-2 top-2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showNsec ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button 
                        onClick={handleNsecLogin}
                        disabled={connectionState === 'connecting' || !nsecInput.trim()}
                        className="w-full bg-primary hover:bg-primary/90"
                        size="lg"
                      >
                        {connectionState === 'connecting' ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Key className="w-5 h-5 mr-2" />
                            Import Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}
              </div>
            </div>
          )
        }

      case 'complete':
        return (
          <div className="space-y-8 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2">Welcome to Nostr Journal!</h2>
              <p className="text-muted-foreground">Redirecting to your journal...</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
      <div className="min-h-screen bg-background flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-4xl flex flex-col justify-center min-h-[500px] sm:min-h-[600px]">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center max-w-2xl mx-auto px-4">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium  ${
                    index <= currentStepIndex 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {index < currentStepIndex ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-12 sm:w-20 h-1 mx-1 sm:mx-2  ${
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Content Area with Slide Animation */}
          <div className="bg-card rounded-xl border p-4 sm:p-8 min-h-[400px] sm:min-h-[500px] relative overflow-hidden flex flex-col justify-center">
            <div className="slide-content w-full">
              {renderStepContent()}
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex justify-center mt-8">
            <Button
              onClick={goBack}
              variant="ghost"
              disabled={currentStepIndex === 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} onGetStarted={() => {
          setShowInfo(false)
          setSelectedPath('new')
          setCurrentStep('method')
        }} />
      )}

    </>
  )
}
