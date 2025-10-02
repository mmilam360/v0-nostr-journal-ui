"use client"
import { useState, useEffect } from "react"
import { LoginPage } from "@/components/login-page"
import { MainApp } from "@/components/main-app"
import type { AuthData } from "@/components/main-app"

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
          console.log("[v0] No existing session found")
          setIsCheckingSession(false)
          return
        }

        const session: StoredSession = JSON.parse(sessionData)
        const age = Date.now() - session.timestamp

        if (age < session.expiresIn) {
          console.log("[v0] Valid session found, restoring auth state")

          // Restore auth data based on method
          const restoredAuthData: AuthData = {
            pubkey: session.pubkey,
            authMethod: session.authMethod,
          }

          if (session.authMethod === "remote") {
            restoredAuthData.bunkerUri = session.bunkerUri
            restoredAuthData.bunkerPubkey = session.bunkerPubkey
            restoredAuthData.relays = session.relays
            if (session.clientSecretKey) {
              restoredAuthData.clientSecretKey = new Uint8Array(session.clientSecretKey)
            }
          } else if (session.authMethod === "nsec") {
            restoredAuthData.nsec = session.nsec
            restoredAuthData.privateKey = session.privateKey
          }

          setAuthData(restoredAuthData)
          setIsLoggedIn(true)
          console.log("[v0] Session restored successfully")
        } else {
          console.log("[v0] Session expired, clearing")
          localStorage.removeItem(SESSION_KEY)
        }
      } catch (error) {
        console.error("[v0] Error checking session:", error)
        localStorage.removeItem(SESSION_KEY)
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  const handleLoginSuccess = (data: AuthData) => {
    console.log("[v0] Login successful:", data)

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
        if (data.clientSecretKey) {
          session.clientSecretKey = Array.from(data.clientSecretKey)
        }
      } else if (data.authMethod === "nsec") {
        session.nsec = data.nsec
        session.privateKey = data.privateKey
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      console.log("[v0] Session saved to localStorage")
    } catch (error) {
      console.error("[v0] Error saving session:", error)
    }

    setAuthData(data)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    console.log("[v0] Logging out")

    try {
      localStorage.removeItem(SESSION_KEY)
      console.log("[v0] Session cleared from localStorage")
    } catch (error) {
      console.error("[v0] Error clearing session:", error)
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
    <main className="min-h-screen bg-slate-900">
      {isLoggedIn && authData ? (
        <MainApp authData={authData} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </main>
  )
}
