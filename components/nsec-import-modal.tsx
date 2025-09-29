"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, EyeOff, Castle as Paste, QrCode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import QrScannerModal from "@/components/qr-scanner-modal"

interface NsecImportModalProps {
  onImport: (nsec: string, password: string) => Promise<void>
  onClose: () => void
}

export default function NsecImportModal({ onImport, onClose }: NsecImportModalProps) {
  const [nsec, setNsec] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const { toast } = useToast()

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.startsWith("nsec1")) {
        setNsec(text.trim())
        toast({
          title: "Pasted successfully",
          description: "Private key pasted from clipboard",
        })
      } else {
        toast({
          title: "Invalid format",
          description: "Clipboard does not contain a valid nsec key",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Paste failed",
        description: "Could not access clipboard",
        variant: "destructive",
      })
    }
  }

  const handleQrScan = (scannedText: string) => {
    if (scannedText.startsWith("nsec1")) {
      setNsec(scannedText.trim())
      setShowQrScanner(false)
      toast({
        title: "QR code scanned",
        description: "Private key imported from QR code",
      })
    } else {
      toast({
        title: "Invalid QR code",
        description: "QR code does not contain a valid nsec key",
        variant: "destructive",
      })
    }
  }

  const handleImport = async () => {
    if (!nsec.trim()) {
      toast({
        title: "Private key required",
        description: "Please enter your nsec private key",
        variant: "destructive",
      })
      return
    }

    if (!nsec.startsWith("nsec1")) {
      toast({
        title: "Invalid format",
        description: "Private key must start with nsec1",
        variant: "destructive",
      })
      return
    }

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

    setIsImporting(true)
    try {
      await onImport(nsec.trim(), password)
      // Success - modal will be closed by parent
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import private key",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Import Existing Account</DialogTitle>
            <DialogDescription className="text-slate-400">
              Import your existing Nostr private key and set a password to encrypt it locally
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Private Key (nsec)</Label>
              <Tabs defaultValue="paste" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                  <TabsTrigger value="paste" className="text-slate-300">
                    Paste
                  </TabsTrigger>
                  <TabsTrigger value="scan" className="text-slate-300">
                    QR Scan
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-2">
                  <div className="relative">
                    <Textarea
                      value={nsec}
                      onChange={(e) => setNsec(e.target.value)}
                      placeholder="nsec1..."
                      className="bg-slate-700 border-slate-600 text-white min-h-[80px] pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 text-slate-400 hover:text-white"
                      onClick={handlePaste}
                    >
                      <Paste className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="scan" className="space-y-2">
                  <Button
                    onClick={() => setShowQrScanner(true)}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Scan QR Code
                  </Button>
                  {nsec && (
                    <div className="p-2 bg-slate-700 rounded text-sm text-slate-300 break-all">
                      {nsec.slice(0, 20)}...
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-password" className="text-slate-300">
                Encryption Password
              </Label>
              <div className="relative">
                <Input
                  id="import-password"
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
              <Label htmlFor="import-confirm-password" className="text-slate-300">
                Confirm Password
              </Label>
              <Input
                id="import-confirm-password"
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
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isImporting || !nsec || !password || !confirmPassword}
              >
                {isImporting ? "Importing..." : "Import Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showQrScanner && <QrScannerModal onScan={handleQrScan} onClose={() => setShowQrScanner(false)} />}
    </>
  )
}
