"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import UnifiedLoginScreen from "@/components/unified-login-screen"
import MainApp, { type AuthData } from "@/components/main-app"
import { generateSecretKey, getPublicKey } from "nostr-tools"
import { encryptPrivateKey } from "@/lib/nostr-crypto"

export default function HomePage() {
  const [authData, setAuthData] = useState<AuthData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const storedAuth = localStorage.getItem("nostr_auth")
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth)
          console.log("[v0] Found existing session:", parsed.authMethod)
          setAuthData(parsed)
        }
      } catch (error) {
        console.error("[v0] Error loading session:", error)
      } finally {
        setIsLoading(false)
      }
    }

    checkExistingSession()
  }, [])

  const handleCreateAccount = async (password: string) => {
    try {
      console.log("[v0] Creating new Nostr account...")

      const privateKeyBytes = generateSecretKey()
      const privateKeyHex = Array.from(privateKeyBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

      // Derive public key
      const pubkeyHex = getPublicKey(privateKeyBytes)
      console.log("[v0] Generated new keypair, pubkey:", pubkeyHex)

      // Encrypt and store the private key
      await encryptPrivateKey(privateKeyHex, password, pubkeyHex)

      const newAuthData: AuthData = {
        pubkey: pubkeyHex,
        authMethod: "nsec",
        privateKey: privateKeyHex,
      }

      // Save to localStorage
      localStorage.setItem("nostr_auth", JSON.stringify(newAuthData))
      setAuthData(newAuthData)

      toast({
        title: "Account created successfully",
        description: "Your Nostr identity has been created and encrypted",
      })
    } catch (error) {
      console.error("[v0] Error creating account:", error)
      toast({
        title: "Failed to create account",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
      throw error
    }
  }

  const handleBunkerConnect = async (result: { pubkey: string }) => {
    try {
      console.log("[v0] Bunker connection successful:", result.pubkey)

      const newAuthData: AuthData = {
        pubkey: result.pubkey,
        authMethod: "nwc",
      }

      // Save to localStorage
      localStorage.setItem("nostr_auth", JSON.stringify(newAuthData))
      setAuthData(newAuthData)

      toast({
        title: "Connected successfully",
        description: "Your signing app is now connected",
      })
    } catch (error) {
      console.error("[v0] Error with bunker connection:", error)
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to connect with signing app",
        variant: "destructive",
      })
      throw error
    }
  }

  const handleExtensionLogin = async (pubkey: string) => {
    try {
      console.log("[v0] Extension login successful:", pubkey)

      const newAuthData: AuthData = {
        pubkey,
        authMethod: "extension",
      }

      // Save to localStorage
      localStorage.setItem("nostr_auth", JSON.stringify(newAuthData))
      setAuthData(newAuthData)

      toast({
        title: "Connected successfully",
        description: "Your browser extension is now connected",
      })
    } catch (error) {
      console.error("[v0] Error with extension login:", error)
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Failed to connect with browser extension",
        variant: "destructive",
      })
      throw error
    }
  }

  const handleLogout = () => {
    console.log("[v0] Logging out...")
    localStorage.removeItem("nostr_auth")
    setAuthData(null)

    toast({
      title: "Logged out",
      description: "Your notes remain encrypted in local storage",
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!authData) {
    return (
      <UnifiedLoginScreen
        onCreateAccount={handleCreateAccount}
        onBunkerConnect={handleBunkerConnect}
        onExtensionLogin={handleExtensionLogin}
      />
    )
  }

  return <MainApp authData={authData} onLogout={handleLogout} />
}
