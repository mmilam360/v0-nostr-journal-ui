"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SyncUnlockModalProps {
  isFirstTime: boolean
  onUnlock: (password: string) => void
  onCreatePassword: (password: string) => void
  onSwitchAccount?: () => void // Add callback for switching accounts
  isLoading?: boolean
  error?: string
}

export default function SyncUnlockModal({
  isFirstTime,
  onUnlock,
  onCreatePassword,
  onSwitchAccount, // Accept the switch account callback
  isLoading = false,
  error,
}: SyncUnlockModalProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const isCreateValid = password.length >= 8 && password === confirmPassword
  const isUnlockValid = password.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isFirstTime) {
      if (isCreateValid) {
        onCreatePassword(password)
      }
    } else {
      if (isUnlockValid) {
        onUnlock(password)
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
  }, [isFirstTime])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-lg border border-slate-700 p-8 w-full max-w-md mx-4 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Icon and Title */}
          <div className="text-center">
            {isFirstTime ? (
              <ShieldCheck className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            ) : (
              <KeyRound className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            )}

            <h2 className="text-2xl font-bold text-white mb-2">
              {isFirstTime ? "Create Your Master Password" : "Unlock Your Journal"}
            </h2>

            <p className="text-slate-400 text-sm leading-relaxed">
              {isFirstTime
                ? "This password encrypts your journal and is the only way to access your notes on new devices. We cannot recover it for you. Please store it safely."
                : "Enter your Master Password to decrypt and sync your notes."}
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
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
                  placeholder={isFirstTime ? "Create a strong password" : "Enter your password"}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isFirstTime && password.length > 0 && password.length < 8 && (
                <p className="text-red-400 text-xs mt-1">Password must be at least 8 characters</p>
              )}
            </div>

            {isFirstTime && (
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
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-md p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isLoading || (isFirstTime ? !isCreateValid : !isUnlockValid)}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isFirstTime ? "Creating..." : "Unlocking..."}
              </div>
            ) : isFirstTime ? (
              "Create & Encrypt Journal"
            ) : (
              "Unlock"
            )}
          </Button>

          {!isFirstTime && onSwitchAccount && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="text-slate-400 hover:text-white hover:underline text-sm transition-colors"
                disabled={isLoading}
              >
                Not you? Switch Nostr account
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
