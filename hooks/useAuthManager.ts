"use client"
import { useState, useEffect } from "react"
import * as nostrTools from "nostr-tools"
import { localKeystore } from "@/lib/keystore"

export type AuthState = "loading" | "no_account" | "locked" | "unlocked"

export interface AuthManager {
  authState: AuthState
  userPubkey: string | null
  nostrSigner: Uint8Array | null
  authMethod: "nsec" | "extension" | "bunker" | null
  createNewAccount: (password: string) => Promise<void>
  importAccount: (nsec: string, password: string) => Promise<void>
  connectBunker: (bunkerUrl: string) => Promise<void>
  connectExtension: (pubkey: string) => Promise<void>
  unlockAccount: (password: string) => Promise<void>
  logout: () => void
  forgetAccount: () => Promise<void>
}

export const useAuthManager = (): AuthManager => {
  const [authState, setAuthState] = useState<AuthState>("loading")
  const [userPubkey, setUserPubkey] = useState<string | null>(null)
  const [nostrSigner, setNostrSigner] = useState<Uint8Array | null>(null)
  const [authMethod, setAuthMethod] = useState<"nsec" | "extension" | "bunker" | null>(null)

  useEffect(() => {
    const checkForLocalAccount = async () => {
      console.log("[v0] Checking for local account in IndexedDB...")
      try {
        const accountExists = await localKeystore.hasAccount()
        if (accountExists) {
          console.log("[v0] Local account found, setting state to locked")
          const pubkey = await localKeystore.getStoredPubkey()
          setUserPubkey(pubkey)
          setAuthState("locked")
        } else {
          console.log("[v0] No local account found, setting state to no_account")
          setAuthState("no_account")
        }
      } catch (error) {
        console.error("[v0] Error checking for local account:", error)
        setAuthState("no_account")
      }
    }

    checkForLocalAccount()
  }, [])

  const createNewAccount = async (password: string) => {
    console.log("[v0] Creating new account...")
    try {
      const nsecBytes = nostrTools.generateSecretKey()
      await localKeystore.saveAccount(nsecBytes, password)
      console.log("[v0] New account created successfully")
      await unlockAccount(password)
    } catch (error) {
      console.error("[v0] Error creating new account:", error)
      throw error
    }
  }

  const importAccount = async (nsec: string, password: string) => {
    console.log("[v0] Importing account...")
    try {
      // Validate and decode nsec
      const { type, data } = nostrTools.nip19.decode(nsec)
      if (type !== "nsec") {
        throw new Error("Invalid private key format")
      }

      const nsecBytes = data as Uint8Array

      // Validate by generating pubkey
      const pubkey = nostrTools.getPublicKey(nsecBytes)
      if (!pubkey) {
        throw new Error("Invalid private key")
      }

      await localKeystore.saveAccount(nsecBytes, password)
      console.log("[v0] Account imported successfully")
      await unlockAccount(password)
    } catch (error) {
      console.error("[v0] Error importing account:", error)
      throw error
    }
  }

  const connectBunker = async (bunkerUrl: string) => {
    console.log("[v0] Connecting with bunker:", bunkerUrl)
    try {
      // For now, this is a placeholder implementation
      // In a real implementation, this would:
      // 1. Parse the bunker URL to extract pubkey and relay
      // 2. Establish connection with the remote signer
      // 3. Store the connection details for future use

      // Extract pubkey from bunker URL (simplified)
      const urlMatch = bunkerUrl.match(/bunker:\/\/([^?]+)/)
      if (!urlMatch) {
        throw new Error("Invalid bunker URL format")
      }

      const npub = urlMatch[1]
      const { type, data } = nostrTools.nip19.decode(npub)
      if (type !== "npub") {
        throw new Error("Invalid public key in bunker URL")
      }

      const pubkey = nostrTools.nip19.npubEncode(data as Uint8Array)

      setUserPubkey(pubkey)
      setAuthMethod("bunker")
      setAuthState("unlocked")

      console.log("[v0] Bunker connection established")
    } catch (error) {
      console.error("[v0] Error connecting with bunker:", error)
      throw error
    }
  }

  const connectExtension = async (pubkey: string) => {
    console.log("[v0] Connecting with browser extension:", pubkey)
    try {
      setUserPubkey(pubkey)
      setAuthMethod("extension")
      setAuthState("unlocked")

      console.log("[v0] Browser extension connection established")
    } catch (error) {
      console.error("[v0] Error connecting with extension:", error)
      throw error
    }
  }

  const unlockAccount = async (password: string) => {
    console.log("[v0] Unlocking account...")
    try {
      const nsecBytes = await localKeystore.loadAccount(password)
      const pubkey = nostrTools.getPublicKey(nsecBytes)

      setUserPubkey(pubkey)
      setNostrSigner(nsecBytes)
      setAuthMethod("nsec")
      setAuthState("unlocked")
      console.log("[v0] Account unlocked successfully")
    } catch (error) {
      console.error("[v0] Error unlocking account:", error)
      throw error
    }
  }

  const logout = () => {
    console.log("[v0] Logging out...")
    setNostrSigner(null)
    if (authMethod === "nsec") {
      setAuthState("locked")
    } else {
      setUserPubkey(null)
      setAuthMethod(null)
      setAuthState("no_account")
    }
  }

  const forgetAccount = async () => {
    console.log("[v0] Forgetting account completely...")
    try {
      await localKeystore.deleteAccount()
      setUserPubkey(null)
      setNostrSigner(null)
      setAuthMethod(null)
      setAuthState("no_account")
      console.log("[v0] Account forgotten successfully")
    } catch (error) {
      console.error("[v0] Error forgetting account:", error)
      throw error
    }
  }

  return {
    authState,
    userPubkey,
    nostrSigner,
    authMethod,
    createNewAccount,
    importAccount,
    connectBunker,
    connectExtension,
    unlockAccount,
    logout,
    forgetAccount,
  }
}
