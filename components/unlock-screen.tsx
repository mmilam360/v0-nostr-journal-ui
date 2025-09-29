"use client"
import { useState } from "react"
import type React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Unlock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface UnlockScreenProps {
  userPubkey: string | null
  onUnlock: (password: string) => Promise<void>
  onForgetAccount: () => Promise<void>
}

export default function UnlockScreen({ userPubkey, onUnlock, onForgetAccount }: UnlockScreenProps) {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isForgetting, setIsForgetting] = useState(false)
  const { toast } = useToast()

  const handleUnlock = async () => {
    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter your password to unlock your journal",
        variant: "destructive",
      })
      return
    }

    setIsUnlocking(true)
    try {
      await onUnlock(password)
      setPassword("")
    } catch (error) {
      toast({
        title: "Incorrect password",
        description: "The password you entered is incorrect. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUnlocking(false)
    }
  }

  const handleForgetAccount = async () => {
    if (
      !confirm(
        "Are you sure you want to forget this account? This will permanently delete your encrypted private key from this device. You will need to import your nsec again to access your journal.",
      )
    ) {
      return
    }

    setIsForgetting(true)
    try {
      await onForgetAccount()
    } catch (error) {
      toast({
        title: "Failed to forget account",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsForgetting(false)
    }
  }

  const formatPubkey = (pubkey: string | null) => {
    if (!pubkey) return "Unknown"
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUnlock()
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-white flex items-center justify-center gap-2">
            <Unlock className="h-6 w-6" />
            Welcome Back
          </CardTitle>
          <CardDescription className="text-slate-400">Account: {formatPubkey(userPubkey)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unlock-password" className="text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Input
                id="unlock-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                className="bg-slate-700 border-slate-600 text-white pr-10"
                placeholder="Enter password to unlock"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleUnlock}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
            disabled={isUnlocking || !password}
          >
            {isUnlocking ? "Unlocking..." : "Unlock Journal"}
          </Button>

          <div className="pt-4 border-t border-slate-700">
            <Button
              onClick={handleForgetAccount}
              variant="ghost"
              className="w-full text-slate-400 hover:text-red-400 hover:bg-slate-700"
              disabled={isForgetting}
            >
              {isForgetting ? "Forgetting Account..." : "Forget Account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
