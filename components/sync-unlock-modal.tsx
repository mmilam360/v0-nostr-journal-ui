"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { ShieldCheck, KeyRound, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEncryptionManager } from "@/hooks/useEncryptionManager"

interface SyncUnlockModalProps {
  userPubkey: string
  nostrSigner: any
  onUnlocked: (encryptionKey: string) => void
  onSwitchAccount?: () => void
}

export default function SyncUnlockModal({
  userPubkey,
  nostrSigner,
  onUnlocked,
  onSwitchAccount,
}: SyncUnlockModalProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { status, errorMessage, createAndSaveSalt, unlockWithPassword, encryptionKey } = useEncryptionManager({
    userPubkey,
    nostrSigner,
  })

  useEffect(() => {
    if (status === "unlocked" && encryptionKey) {
      onUnlocked(encryptionKey)
    }
  }, [status, encryptionKey, onUnlocked])

  const isCreateValid = password.length >= 8 && password === confirmPassword
  const isUnlockValid = password.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (status === "needs_creation") {
      if (isCreateValid) {
        createAndSaveSalt(password)
      }
    } else if (status === "needs_unlock") {
      if (isUnlockValid) {
        unlockWithPassword(password)
      }
    }
  }

  const handleSwitchAccount = () => {
    if (onSwitchAccount) {
      onSwitchAccount()
    }
  }

  // Reset form when switching between states
  useEffect(() => {
    setPassword("")
    setConfirmPassword("")
    setShowPassword(false)
    setShowConfirmPassword(false)
  }, [status])

  const renderContent = () => {
    switch (status) {
      case "checking_nostr":
        return (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <h2 className="text-2xl font-bold text-white mb-2">Checking Account Status</h2>
            <p className="text-slate-400 text-sm leading-relaxed">Checking account status on Nostr...</p>
          </div>
        )

      case "needs_creation":
        return (
          <>
            <div className="text-center">
              <ShieldCheck className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Create Your Master Password</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                This password encrypts your journal and is the only way to access your notes on new devices. We cannot
                recover it for you. Please store it safely.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                  Master Password
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white pr-10"
                    placeholder="Create a strong password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 8 && (
                  <p className="text-red-400 text-xs mt-1">Password must be at least 8 characters</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-slate-300 text-sm font-medium">
                  Confirm Master Password
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white pr-10"
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!isCreateValid}
              >
                Create & Encrypt Journal
              </Button>
            </form>
          </>
        )

      case "needs_unlock":
        return (
          <>
            <div className="text-center">
              <KeyRound className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Unlock Your Journal</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Enter your Master Password to decrypt and sync your notes.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                  Master Password
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white pr-10"
                    placeholder="Enter your password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!isUnlockValid}
              >
                Unlock
              </Button>

              {onSwitchAccount && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    className="text-slate-400 hover:text-white hover:underline text-sm transition-colors"
                  >
                    Not you? Switch Nostr account
                  </button>
                </div>
              )}
            </form>
          </>
        )

      case "error":
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-500 text-2xl">⚠</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Connection Error</h2>
            <p className="text-red-400 text-sm leading-relaxed mb-4">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-700 text-white">
              Retry
            </Button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-lg border border-slate-700 p-8 w-full max-w-md mx-4 shadow-2xl">
        <div className="space-y-6">{renderContent()}</div>
      </div>
    </div>
  )
}
