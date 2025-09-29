"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CreateAccountModalProps {
  onCreateAccount: (password: string) => Promise<void>
  onClose: () => void
}

export default function CreateAccountModal({ onCreateAccount, onClose }: CreateAccountModalProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const handleCreateAccount = async () => {
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please make sure both passwords are identical",
        variant: "destructive",
      })
      return
    }

    setIsCreating(true)
    try {
      await onCreateAccount(password)
      onClose()
      setPassword("")
      setConfirmPassword("")
    } catch (error) {
      toast({
        title: "Failed to create account",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">Create Your Local Account Password</DialogTitle>
          <DialogDescription className="text-slate-400">
            This password encrypts your new Nostr key and is used to unlock your journal on this device only. Please
            store it safely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              Create Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white pr-10"
                placeholder="Enter a strong password"
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

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-300">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              placeholder="Confirm your password"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAccount}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isCreating || !password || !confirmPassword}
            >
              {isCreating ? "Creating..." : "Create & Encrypt Account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
