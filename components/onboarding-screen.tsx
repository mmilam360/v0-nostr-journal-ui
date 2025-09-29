"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserPlus, LogIn, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import NsecImportModal from "@/components/nsec-import-modal"

interface OnboardingScreenProps {
  onCreateAccount: (password: string) => Promise<void>
  onImportAccount: (nsec: string, password: string) => Promise<void>
}

export default function OnboardingScreen({ onCreateAccount, onImportAccount }: OnboardingScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
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
      setShowCreateModal(false)
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

  const handleImportAccount = async (nsec: string, importPassword: string) => {
    try {
      await onImportAccount(nsec, importPassword)
      setShowImportModal(false)
    } catch (error) {
      throw error // Let the import modal handle the error display
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-white">Welcome to Nostr Journal</CardTitle>
          <CardDescription className="text-slate-400">
            Your private, encrypted journal on the Nostr network
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
          >
            <UserPlus className="mr-2 h-5 w-5" />
            Create a New Nostr Account
          </Button>

          <Button
            onClick={() => setShowImportModal(true)}
            variant="outline"
            className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-700"
            size="lg"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Import Existing Account (nsec)
          </Button>
        </CardContent>
      </Card>

      {/* Create Account Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create Your Master Password</DialogTitle>
            <DialogDescription className="text-slate-400">
              This password will encrypt your private key locally. Choose a strong password you won't forget.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">
                Password
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
                onClick={() => setShowCreateModal(false)}
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateAccount}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isCreating || !password || !confirmPassword}
              >
                {isCreating ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Account Modal */}
      {showImportModal && <NsecImportModal onImport={handleImportAccount} onClose={() => setShowImportModal(false)} />}
    </div>
  )
}
