"use client"

import { useState, useEffect } from "react"
import LoginScreen from "@/components/login-screen"
import MainApp from "@/components/main-app"
import SyncUnlockModal from "@/components/sync-unlock-modal"

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec"
  privateKey?: string // Only for nsec login
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    const checkExistingSession = async () => {
      console.log("[v0] Checking for existing sessions...")

      try {
        const savedNsec = localStorage.getItem("nostrUserNsec")
        const savedExtensionPubkey = localStorage.getItem("nostrExtensionPubkey")
        const savedEncryptionKey = localStorage.getItem("nostrEncryptionKey")

        if (savedNsec) {
          console.log("[v0] Found saved nsec in localStorage, auto-logging in...")

          // Import nostr-tools functions for key derivation
          const { nip19, getPublicKey } = await import("nostr-tools")

          // Decode the nsec to get the private key
          const { type, data } = nip19.decode(savedNsec)
          if (type === "nsec") {
            const privateKeyHex = Array.from(data as Uint8Array, (byte) => byte.toString(16).padStart(2, "0")).join("")
            const pubkeyHex = getPublicKey(data as Uint8Array)

            // Set auth data and proceed to unlock modal
            const authData: AuthData = {
              pubkey: pubkeyHex,
              authMethod: "nsec",
              privateKey: privateKeyHex,
            }

            setAuthData(authData)
            setIsAuthenticated(true)

            if (savedEncryptionKey) {
              setEncryptionKey(savedEncryptionKey)
              setIsUnlocked(true)
              console.log("[v0] Auto-login with saved encryption key successful")
            } else {
              setShowSyncModal(true)
              console.log("[v0] Auto-login successful, showing unlock modal")
            }
          }
        } else if (savedExtensionPubkey) {
          console.log("[v0] Found saved extension session, checking browser extension...")

          if (typeof window !== "undefined" && window.nostr) {
            try {
              const pubkey = await window.nostr.getPublicKey()
              if (pubkey === savedExtensionPubkey) {
                const authData: AuthData = {
                  pubkey: pubkey,
                  authMethod: "extension",
                }

                setAuthData(authData)
                setIsAuthenticated(true)

                if (savedEncryptionKey) {
                  setEncryptionKey(savedEncryptionKey)
                  setIsUnlocked(true)
                  console.log("[v0] Auto-login with extension and saved encryption key successful")
                } else {
                  setShowSyncModal(true)
                  console.log("[v0] Extension auto-login successful, showing unlock modal")
                }
              } else {
                console.log("[v0] Extension pubkey mismatch, clearing session")
                localStorage.removeItem("nostrExtensionPubkey")
                localStorage.removeItem("nostrEncryptionKey")
              }
            } catch (error) {
              console.log("[v0] Extension not available, clearing session")
              localStorage.removeItem("nostrExtensionPubkey")
              localStorage.removeItem("nostrEncryptionKey")
            }
          } else {
            console.log("[v0] No browser extension found, clearing session")
            localStorage.removeItem("nostrExtensionPubkey")
            localStorage.removeItem("nostrEncryptionKey")
          }
        } else {
          console.log("[v0] No saved session found")
        }
      } catch (error) {
        console.error("[v0] Error checking saved session:", error)
        // Clear invalid session data
        localStorage.removeItem("nostrUserNsec")
        localStorage.removeItem("nostrExtensionPubkey")
        localStorage.removeItem("nostrEncryptionKey")
      }

      setIsCheckingSession(false)
    }

    checkExistingSession()
  }, [])

  const handleLogin = async (authData: AuthData) => {
    console.log("[v0] User logged in with method:", authData.authMethod, "pubkey:", authData.pubkey)

    if (authData.authMethod === "nsec" && authData.privateKey) {
      try {
        const { nip19 } = await import("nostr-tools")
        const privateKeyBytes = new Uint8Array(
          authData.privateKey.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
        )
        const nsec = nip19.nsecEncode(privateKeyBytes)
        localStorage.setItem("nostrUserNsec", nsec)
        console.log("[v0] Saved nsec to localStorage for session persistence")
      } catch (error) {
        console.error("[v0] Error saving session:", error)
      }
    } else if (authData.authMethod === "extension") {
      localStorage.setItem("nostrExtensionPubkey", authData.pubkey)
      console.log("[v0] Saved extension pubkey to localStorage for session persistence")
    }

    setAuthData(authData)
    setIsAuthenticated(true)
    setShowSyncModal(true)
  }

  const handleUnlocked = (key: string) => {
    console.log("[v0] Journal unlocked successfully")
    setEncryptionKey(key)
    setShowSyncModal(false)
    setIsUnlocked(true)

    localStorage.setItem("nostrEncryptionKey", key)
    console.log("[v0] Saved encryption key for future auto-unlock")
  }

  const handleSwitchAccount = () => {
    console.log("[v0] Switching Nostr account...")

    localStorage.removeItem("nostrUserNsec")
    localStorage.removeItem("nostrExtensionPubkey")
    localStorage.removeItem("nostrEncryptionKey")

    // Reset all state
    setAuthData(null)
    setIsAuthenticated(false)
    setShowSyncModal(false)
    setIsUnlocked(false)
    setEncryptionKey(null)

    // Force a page reload to ensure clean state
    window.location.reload()
  }

  const handleLogout = () => {
    console.log("[v0] User logged out")

    localStorage.removeItem("nostrUserNsec")
    localStorage.removeItem("nostrExtensionPubkey")
    localStorage.removeItem("nostrEncryptionKey")
    console.log("[v0] Cleared all session data from localStorage")

    setAuthData(null)
    setIsAuthenticated(false)
    setShowSyncModal(false)
    setIsUnlocked(false)
    setEncryptionKey(null)
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {!isAuthenticated || !authData ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <>
          {/* Main App - shown in locked state until unlocked */}
          <div className={`${!isUnlocked ? "backdrop-blur-sm" : ""}`}>
            <div className={`${!isUnlocked ? "bg-black/20" : ""}`}>
              <MainApp authData={authData} onLogout={handleLogout} encryptionKey={encryptionKey} />
            </div>
          </div>

          {showSyncModal && authData && (
            <SyncUnlockModal
              userPubkey={authData.pubkey}
              nostrSigner={authData.privateKey} // Pass the private key as signer
              onUnlocked={handleUnlocked}
              onSwitchAccount={handleSwitchAccount}
            />
          )}
        </>
      )}
    </div>
  )
}
