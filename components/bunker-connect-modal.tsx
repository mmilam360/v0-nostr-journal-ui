"use client"
import { useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle, AlertCircle, Copy, ExternalLink, QrCode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useBunkerConnection } from "@/hooks/useBunkerConnection"

interface BunkerConnectModalProps {
  onConnect: (bunkerUrl: string) => Promise<void>
  onClose: () => void
}

export default function BunkerConnectModal({ onConnect, onClose }: BunkerConnectModalProps) {
  const { state, connectionString, qrCodeData, error, connect, reset } = useBunkerConnection()
  const { toast } = useToast()

  useEffect(() => {
    // Start the connection process when modal opens
    connect()
  }, [connect])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectionString)
      toast({
        title: "Copied to clipboard",
        description: "Connection string copied successfully",
      })
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const handleOpenInApp = () => {
    // Try to open in nsec.app or other signing apps
    const nsecAppUrl = `https://nsec.app/bunker?connection=${encodeURIComponent(connectionString)}`
    window.open(nsecAppUrl, "_blank")
  }

  const handleTryAgain = () => {
    reset()
    connect()
  }

  const handleSuccess = async () => {
    try {
      await onConnect(connectionString)
      onClose()
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to establish bunker connection",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Connect with Signing App</DialogTitle>
          <DialogDescription className="text-slate-400">
            Connect securely using a remote signing app like Nsec.app
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Generating State */}
          {state === "generating" && (
            <div className="flex flex-col items-center space-y-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-slate-300">Generating secure connection...</p>
            </div>
          )}

          {/* Awaiting Approval State */}
          {state === "awaiting_approval" && (
            <div className="space-y-4">
              {/* QR Code Placeholder */}
              <div className="flex justify-center">
                <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center">
                  <QrCode className="h-12 w-12 text-slate-600" />
                  <span className="ml-2 text-slate-600 text-sm">QR Code</span>
                </div>
              </div>

              {/* Connection String */}
              <div className="space-y-2">
                <Label className="text-slate-300">Connection String</Label>
                <div className="flex space-x-2">
                  <Input
                    value={connectionString}
                    readOnly
                    className="bg-slate-700 border-slate-600 text-white text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button onClick={handleOpenInApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Nsec.app
                </Button>

                <div className="flex items-center justify-center space-x-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-slate-400 text-sm">Waiting for approval...</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Instructions:</h4>
                <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                  <li>Scan the QR code with your signing app</li>
                  <li>Or copy the connection string and paste it in your app</li>
                  <li>Approve the connection request in your signing app</li>
                  <li>Wait for the connection to be established</li>
                </ol>
              </div>
            </div>
          )}

          {/* Success State */}
          {state === "success" && (
            <div className="flex flex-col items-center space-y-4 py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <h3 className="text-white font-medium">Connection Successful!</h3>
                <p className="text-slate-400 text-sm">Your signing app is now connected</p>
              </div>
              <Button onClick={handleSuccess} className="w-full bg-green-600 hover:bg-green-700 text-white">
                Continue to Journal
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === "error" && (
            <div className="flex flex-col items-center space-y-4 py-8">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <h3 className="text-white font-medium">Connection Failed</h3>
                <p className="text-slate-400 text-sm">{error}</p>
              </div>
              <div className="flex space-x-2 w-full">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
                >
                  Cancel
                </Button>
                <Button onClick={handleTryAgain} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
