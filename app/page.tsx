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

      // No existing session found
      setIsCheckingSession(false)
    }

    checkExistingSession()
  }, [])

  const handleLogin = async (authData: AuthData) => {
    console.log("[v0] User logged in with method:", authData.authMethod, "pubkey:", authData.pubkey)
    setAuthData(authData)
    setIsAuthenticated(true)

    setShowSyncModal(true)
  }

  const handleUnlocked = (key: string) => {
    console.log("[v0] Journal unlocked successfully")
    setEncryptionKey(key)
    setShowSyncModal(false)
    setIsUnlocked(true)
  }

  const handleSwitchAccount = () => {
    console.log("[v0] Switching Nostr account...")

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
              <MainApp authData={authData} onLogout={handleLogout} />
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
