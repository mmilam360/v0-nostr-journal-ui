"use client"

import { useState } from "react"
import { Zap, KeyRound, AlertTriangle, QrCode, X, Copy, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { nip19, getPublicKey } from "nostr-tools"
import { QrScannerComponent } from "./qr-scanner-component"

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec"
  privateKey?: string // Only for nsec login
}

interface LoginScreenProps {
  onLogin: (authData: AuthData) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [showNsecModal, setShowNsecModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showExportWarning, setShowExportWarning] = useState(true)
  const [nsecInput, setNsecInput] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState("")
  const [showQrScanner, setShowQrScanner] = useState(false)

  const handleBrowserExtensionLogin = async () => {
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

  const handleNsecLogin = async () => {
    if (!nsecInput.trim()) {
      setError("Please enter your nsec key")
      return
    }

    setIsConnecting(true)
    setError("")

    try {
      if (!nsecInput.startsWith("nsec1")) {
        throw new Error("Invalid nsec format. Should start with 'nsec1'")
      }

      const { type, data } = nip19.decode(nsecInput.trim())

      if (type !== "nsec") {
        throw new Error("Invalid nsec format. Should start with 'nsec1'")
      }

      // Convert the decoded data to hex string
      const privateKeyHex = Array.from(data as Uint8Array, (byte) => byte.toString(16).padStart(2, "0")).join("")

      // Derive public key from private key
      const pubkeyHex = getPublicKey(data as Uint8Array)
      console.log("[v0] Successfully derived public key from nsec:", pubkeyHex)

      // Clear the nsec input for security
      setNsecInput("")
      setShowNsecModal(false)

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

  const handleQrScanSuccess = (data: string) => {
    console.log("[v0] QR scan successful:", data.substring(0, 20) + "...")
    setNsecInput(data)
    setShowQrScanner(false)
  }

  const handleQrScanError = (error: string) => {
    console.error("[v0] QR scan error:", error)
    setError(error)
    setShowQrScanner(false)
  }

  const isValidNsec = nsecInput.trim().startsWith("nsec1") && nsecInput.trim().length > 10

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-white mb-2">Nostr Journal</h1>
          <p className="text-slate-400">Your private thoughts, encrypted and secure.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <Button
            onClick={handleBrowserExtensionLogin}
            disabled={isConnecting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-lg py-3 flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            {isConnecting ? "Connecting..." : "Login with Browser Extension"}
          </Button>

          <Button
            onClick={() => setShowNsecModal(true)}
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 rounded-lg py-3 flex items-center justify-center gap-2"
          >
            <KeyRound className="w-5 h-5" />
            Login with Private Key (nsec)
          </Button>
        </div>

        <div className="mt-6 p-3 bg-slate-700/50 rounded-lg">
          <p className="text-slate-400 text-xs text-center">
            🔒 Your notes are encrypted locally using your Nostr identity. They sync across devices when you log in with
            the same credentials.
          </p>
        </div>

        {/* Demo button for export modal - remove in production */}
        <div className="mt-4">
          <Button onClick={() => setShowExportModal(true)} variant="ghost" className="w-full text-slate-500 text-xs">
            Demo: Link Device Modal
          </Button>
        </div>
      </div>

      {showNsecModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowNsecModal(false)
                setNsecInput("")
                setError("")
                setShowQrScanner(false)
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-semibold text-white mb-4 text-center">Enter Your Private Key</h2>

            {/* Security Warning */}
            <div className="mb-6 p-3 bg-red-900/20 border border-red-700 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">
                Your private key should be treated like a password. We will not save it, but be careful where you paste
                it.
              </p>
            </div>

            {showQrScanner ? (
              <div className="space-y-4">
                <div className="h-64 bg-black rounded-lg overflow-hidden">
                  <QrScannerComponent onScanSuccess={handleQrScanSuccess} onScanError={handleQrScanError} />
                </div>
                <Button onClick={() => setShowQrScanner(false)} variant="outline" className="w-full">
                  Cancel Scan
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Paste Input */}
                <div>
                  <Textarea
                    placeholder="nsec1..."
                    value={nsecInput}
                    onChange={(e) => setNsecInput(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 min-h-[100px] font-mono text-sm"
                    onKeyPress={(e) => e.key === "Enter" && e.ctrlKey && handleNsecLogin()}
                  />
                </div>

                <Button
                  onClick={handleNsecLogin}
                  disabled={isConnecting || !isValidNsec}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white"
                >
                  {isConnecting ? "Deriving Keys..." : "Login"}
                </Button>

                {/* OR Separator */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-slate-800 text-slate-400">OR</span>
                  </div>
                </div>

                {/* Scan Button */}
                <Button
                  onClick={() => setShowQrScanner(true)}
                  variant="outline"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 flex items-center justify-center gap-2"
                >
                  <QrCode className="w-5 h-5" />
                  Scan from Another Device
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md relative">
            <button
              onClick={() => {
                setShowExportModal(false)
                setShowExportWarning(true)
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {showExportWarning ? (
              <div className="text-center">
                <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-4">Security Warning</h2>
                <p className="text-slate-300 mb-6 text-sm leading-relaxed">
                  You are about to view your private key. Anyone who sees this key can control your Nostr account. Do
                  not do this on a public computer or if anyone can see your screen. Are you sure you want to continue?
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowExportWarning(false)}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                  >
                    Show My Key
                  </Button>
                  <Button onClick={() => setShowExportModal(false)} variant="outline" className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-6">Link a New Device</h2>

                {/* QR Code Placeholder */}
                <div className="bg-white p-4 rounded-lg mb-4 mx-auto w-48 h-48 flex items-center justify-center">
                  {/*  qrcode.react component will render here  */}
                  <div className="text-black text-xs text-center">
                    QR Code
                    <br />
                    (Demo: nsec1abc...xyz)
                  </div>
                </div>

                {/* Text String */}
                <div className="bg-slate-700 p-3 rounded-lg mb-4">
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono text-slate-300 flex-1 text-left">
                      nsec1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz...
                    </code>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText("nsec1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz...")
                        // Could add toast notification here
                      }}
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-slate-400 hover:text-white"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-slate-400 text-sm">
                  Scan this QR code with your new device, or copy the key to your clipboard.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
