"use client"

import { useState, useEffect } from "react"
import LoginScreen from "@/components/login-screen"
import MainApp from "@/components/main-app"
import SyncUnlockModal from "@/components/sync-unlock-modal"

export interface AuthData {
  pubkey: string
  authMethod: "extension" | "nsec" | "nwc"
  privateKey?: string // Only for nsec login
  nwcUri?: string // Only for NWC login
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [syncModalLoading, setSyncModalLoading] = useState(false)
  const [syncModalError, setSyncModalError] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    const checkExistingSession = async () => {
      console.log("[v0] Checking for existing sessions...")

      // Check for NWC session
      const savedNwcUri = localStorage.getItem("nostr-journal-nwc-uri")
      if (savedNwcUri) {
        try {
          console.log("[v0] Found existing NWC session")
          const url = new URL(savedNwcUri)
          const pubkey = url.pathname.replace("//", "")

          const authData: AuthData = {
            pubkey,
            authMethod: "nwc",
            nwcUri: savedNwcUri,
          }

          setAuthData(authData)
          setIsAuthenticated(true)

          // Show sync unlock modal for returning users
          await handleExistingUser(authData)
          setIsCheckingSession(false)
          return
        } catch (error) {
          console.error("[v0] Failed to restore NWC session:", error)
          localStorage.removeItem("nostr-journal-nwc-uri")
        }
      }

      // No existing session found
      setIsCheckingSession(false)
    }

    checkExistingSession()
  }, [])

  const handleExistingUser = async (authData: AuthData) => {
    setSyncModalLoading(true)
    try {
      // TODO: Check for existing salt event on Nostr
      // For now, simulate checking - in real implementation this would query Nostr
      const hasExistingSalt = true // Existing users should have a salt

      setIsFirstTime(!hasExistingSalt)
      setShowSyncModal(true)
    } catch (error) {
      console.error("[v0] Error checking for existing salt:", error)
      setSyncModalError("Failed to check encryption status")
    } finally {
      setSyncModalLoading(false)
    }
  }

  const handleLogin = async (authData: AuthData) => {
    console.log("[v0] User logged in with method:", authData.authMethod, "pubkey:", authData.pubkey)
    setAuthData(authData)
    setIsAuthenticated(true)

    // Check if user has existing encryption salt
    setSyncModalLoading(true)
    try {
      // TODO: Check for existing salt event on Nostr
      // For now, simulate checking - in real implementation this would query Nostr
      const hasExistingSalt = false // This will be replaced with actual salt check

      setIsFirstTime(!hasExistingSalt)
      setShowSyncModal(true)
    } catch (error) {
      console.error("[v0] Error checking for existing salt:", error)
      setSyncModalError("Failed to check encryption status")
    } finally {
      setSyncModalLoading(false)
    }
  }

  const handleCreatePassword = async (password: string) => {
    setSyncModalLoading(true)
    setSyncModalError("")

    try {
      console.log("[v0] Creating master password and salt...")

      // TODO: Implement salt generation and storage
      // 1. Generate random salt
      // 2. Derive master key from password + salt using PBKDF2
      // 3. Store salt in Nostr event (kind: 30078)

      // Simulate password creation process
      await new Promise((resolve) => setTimeout(resolve, 1500))

      console.log("[v0] Master password created successfully")
      setShowSyncModal(false)
      setIsUnlocked(true)
    } catch (error) {
      console.error("[v0] Error creating master password:", error)
      setSyncModalError("Failed to create master password. Please try again.")
    } finally {
      setSyncModalLoading(false)
    }
  }

  const handleUnlockPassword = async (password: string) => {
    setSyncModalLoading(true)
    setSyncModalError("")

    try {
      console.log("[v0] Unlocking journal with master password...")

      // TODO: Implement password verification
      // 1. Fetch salt from Nostr
      // 2. Derive master key from password + salt
      // 3. Try to decrypt a test note to verify password

      // Simulate password verification process
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Simulate password validation (in real implementation, this would verify against encrypted data)
      if (password.length < 3) {
        // Simple validation for demo
        throw new Error("Invalid password")
      }

      console.log("[v0] Journal unlocked successfully")
      setShowSyncModal(false)
      setIsUnlocked(true)
    } catch (error) {
      console.error("[v0] Error unlocking journal:", error)
      setSyncModalError("Invalid password. Please try again.")
    } finally {
      setSyncModalLoading(false)
    }
  }

  const handleSwitchAccount = () => {
    console.log("[v0] Switching Nostr account...")

    // Clear all session data
    localStorage.removeItem("nostr-journal-nwc-uri")
    // Clear any other stored session data if needed

    // Reset all state
    setAuthData(null)
    setIsAuthenticated(false)
    setShowSyncModal(false)
    setIsUnlocked(false)
    setSyncModalError("")
    setIsFirstTime(false)
    setSyncModalLoading(false)

    // Force a page reload to ensure clean state
    window.location.reload()
  }

  const handleLogout = () => {
    console.log("[v0] User logged out")

    // Clear NWC session if it exists
    if (authData?.authMethod === "nwc") {
      localStorage.removeItem("nostr-journal-nwc-uri")
    }

    setAuthData(null)
    setIsAuthenticated(false)
    setShowSyncModal(false)
    setIsUnlocked(false)
    setSyncModalError("")
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

          {/* Sync Unlock Modal */}
          {showSyncModal && (
            <SyncUnlockModal
              isFirstTime={isFirstTime}
              onCreatePassword={handleCreatePassword}
              onUnlock={handleUnlockPassword}
              onSwitchAccount={handleSwitchAccount}
              isLoading={syncModalLoading}
              error={syncModalError}
            />
          )}
        </>
      )}
    </div>
  )
}
