"use client"
import { useState, useEffect } from "react"
import * as nostrTools from "nostr-tools"
import { localKeystore } from "@/lib/keystore"

export type AuthState = "loading" | "no_account" | "locked" | "unlocked"

export interface AuthManager {
  authState: AuthState
  userPubkey: string | null
  nostrSigner: Uint8Array | null
  createNewAccount: (password: string) => Promise<void>
  importAccount: (nsec: string, password: string) => Promise<void>
  unlockAccount: (password: string) => Promise<void>
  logout: () => void
  forgetAccount: () => Promise<void>
}

export const useAuthManager = (): AuthManager => {
  const [authState, setAuthState] = useState<AuthState>("loading")
  const [userPubkey, setUserPubkey] = useState<string | null>(null)
  const [nostrSigner, setNostrSigner] = useState<Uint8Array | null>(null)

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

  const unlockAccount = async (password: string) => {
    console.log("[v0] Unlocking account...")
    try {
      const nsecBytes = await localKeystore.loadAccount(password)
      const pubkey = nostrTools.getPublicKey(nsecBytes)

      setUserPubkey(pubkey)
      setNostrSigner(nsecBytes)
      setAuthState("unlocked")
      console.log("[v0] Account unlocked successfully")
    } catch (error) {
      console.error("[v0] Error unlocking account:", error)
      throw error
    }
  }

  const logout = () => {
    console.log("[v0] Logging out (locking account)...")
    setNostrSigner(null)
    setAuthState("locked")
  }

  const forgetAccount = async () => {
    console.log("[v0] Forgetting account completely...")
    try {
      await localKeystore.deleteAccount()
      setUserPubkey(null)
      setNostrSigner(null)
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
    createNewAccount,
    importAccount,
    unlockAccount,
    logout,
    forgetAccount,
  }
}
