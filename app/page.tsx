"use client"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import LoginPageHorizontal from "@/components/login-page-horizontal"
import type { AuthData } from "@/components/main-app"
import { ErrorBoundary } from "@/components/error-boundary"

// Dynamically import MainApp to avoid SSR issues and bundling problems
const MainApp = dynamic(() => import("@/components/main-app").then(mod => ({ default: mod.MainApp })), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-400">Loading...</p>
      </div>
    </main>
  )
})

const SESSION_KEY = "nostr_session"
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

interface StoredSession {
  pubkey: string
  authMethod: "extension" | "nsec" | "remote"
  timestamp: number
  expiresIn: number
  // For remote signer
  bunkerUri?: string
  clientSecretKey?: number[] // Stored as array for JSON serialization
  bunkerPubkey?: string
  relays?: string[]
  sessionData?: any // For nostr-signer-connector session management
  // For nsec
  nsec?: string
  privateKey?: string
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    const checkSession = () => {
      try {
        const sessionData = localStorage.getItem(SESSION_KEY)
        if (!sessionData) {
          console.log("[NostrJournal] No existing session found")
          setIsCheckingSession(false)
          return
        }

        const session: StoredSession = JSON.parse(sessionData)
        const age = Date.now() - session.timestamp

        if (age < session.expiresIn) {
          console.log("[NostrJournal] Valid session found, restoring auth state")

          // Restore auth data based on method
          const restoredAuthData: AuthData = {
            pubkey: session.pubkey,
            authMethod: session.authMethod,
          }

          if (session.authMethod === "remote") {
            restoredAuthData.bunkerUri = session.bunkerUri
            restoredAuthData.bunkerPubkey = session.bunkerPubkey
            restoredAuthData.relays = session.relays
            restoredAuthData.sessionData = session.sessionData
            if (session.clientSecretKey) {
              restoredAuthData.clientSecretKey = new Uint8Array(session.clientSecretKey)
            }
          } else if (session.authMethod === "nsec") {
            restoredAuthData.nsec = session.nsec
            restoredAuthData.privateKey = session.privateKey
          }

          setAuthData(restoredAuthData)
          setIsLoggedIn(true)
          console.log("[NostrJournal] Session restored successfully")
        } else {
          console.log("[NostrJournal] Session expired, clearing")
          localStorage.removeItem(SESSION_KEY)
        }
      } catch (error) {
        console.error("[NostrJournal] Error checking session:", error)
        localStorage.removeItem(SESSION_KEY)
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  const handleLoginSuccess = (data: AuthData) => {
    console.log("[NostrJournal] 🎉 Login success handler called!")
    console.log("[NostrJournal] 📦 Auth data received:", {
      pubkey: data.pubkey,
      authMethod: data.authMethod,
      hasPrivateKey: !!data.privateKey,
      hasBunkerUri: !!data.bunkerUri,
      hasClientSecretKey: !!data.clientSecretKey,
      hasBunkerPubkey: !!data.bunkerPubkey,
      hasSessionData: !!data.sessionData,
      relays: data.relays
    })

    // Validate the data before storing
    if (!data.pubkey) {
      console.error("[NostrJournal] ❌ ERROR: No pubkey in auth data!")
      alert("Login failed: No pubkey received. Please try again.")
      return
    }

    if (data.pubkey.length !== 64) {
      console.error("[NostrJournal] ❌ ERROR: Invalid pubkey length:", data.pubkey.length)
      alert("Login failed: Invalid pubkey format. Please try again.")
      return
    }

    // Validate based on auth method
    if (data.authMethod === "nsec") {
      if (!data.privateKey) {
        console.error("[NostrJournal] ❌ ERROR: Nsec login missing privateKey!")
        alert("Login failed: Private key missing.")
        return
      }
      console.log("[NostrJournal] ✅ Nsec login data validated")
    }

    if (data.authMethod === "remote") {
      if (!data.bunkerUri) {
        console.error("[NostrJournal] ❌ ERROR: Remote signer missing bunkerUri!")
        alert("Login failed: Remote signer configuration incomplete.")
        return
      }
      if (!data.clientSecretKey) {
        console.error("[NostrJournal] ❌ ERROR: Remote signer missing clientSecretKey!")
        alert("Login failed: Remote signer configuration incomplete.")
        return
      }
      if (!data.bunkerPubkey) {
        console.error("[NostrJournal] ❌ ERROR: Remote signer missing bunkerPubkey!")
        alert("Login failed: Remote signer configuration incomplete.")
        return
      }
      console.log("[NostrJournal] ✅ Remote signer data validated")
    }

    try {
      const session: StoredSession = {
        pubkey: data.pubkey,
        authMethod: data.authMethod,
        timestamp: Date.now(),
        expiresIn: SESSION_DURATION,
      }

      if (data.authMethod === "remote") {
        session.bunkerUri = data.bunkerUri
        session.bunkerPubkey = data.bunkerPubkey
        session.relays = data.relays
        session.sessionData = data.sessionData
        if (data.clientSecretKey) {
          session.clientSecretKey = data.clientSecretKey.map(Number)
        }
      } else if (data.authMethod === "nsec") {
        session.nsec = data.nsec
        session.privateKey = data.privateKey
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      console.log("[NostrJournal] 💾 Session saved to localStorage")

      // CRITICAL: Update state to trigger re-render and show main app
      setAuthData(data)
      setIsLoggedIn(true)
      console.log("[NostrJournal] ✅ State updated, app should now show main content")
    } catch (error) {
      console.error("[NostrJournal] ❌ Error saving session:", error)
      alert("Login failed: Could not save session. Please try again.")
    }
  }

  const handleLogout = () => {
    console.log("[NostrJournal] Logging out")

    try {
      localStorage.removeItem(SESSION_KEY)
      console.log("[NostrJournal] Session cleared from localStorage")
    } catch (error) {
      console.error("[NostrJournal] Error clearing session:", error)
    }

    setAuthData(null)
    setIsLoggedIn(false)
  }

  if (isCheckingSession) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-slate-900">
        
        {isLoggedIn && authData ? (
          <MainApp authData={authData} onLogout={handleLogout} />
                ) : (
                  <div>
                        <LoginPageHorizontal onLoginSuccess={handleLoginSuccess} />
                  </div>
                )}
      </main>
    </ErrorBoundary>
  )
}
