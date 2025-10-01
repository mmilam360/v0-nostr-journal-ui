"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { LoginPage } from "@/components/login-page"
import MainApp, { type AuthData } from "@/components/main-app"
import { useToast } from "@/hooks/use-toast"

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const storedAuth = localStorage.getItem("nostr_auth")
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth)
          console.log("[v0] Found existing session:", parsed.authMethod)
          setAuthData(parsed)
          setIsLoggedIn(true)
        }
      } catch (error) {
        console.error("[v0] Error loading session:", error)
      } finally {
        setIsLoading(false)
      }
    }

    checkExistingSession()
  }, [])

  const handleLoginSuccess = (newAuthData: AuthData) => {
    console.log("[v0] Login successful, switching to main app")
    localStorage.setItem("nostr_auth", JSON.stringify(newAuthData))
    setAuthData(newAuthData)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    console.log("[v0] Logging out...")
    localStorage.removeItem("nostr_auth")
    setAuthData(null)
    setIsLoggedIn(false)

    toast({
      title: "Logged out",
      description: "Your notes remain encrypted in local storage",
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center">
      {isLoggedIn && authData ? (
        <MainApp authData={authData} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </main>
  )
}
