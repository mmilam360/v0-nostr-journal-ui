"use client"

import { useState, useEffect } from "react"
import { X, Loader2, CameraOff, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QrScannerComponent } from "./qr-scanner-component"

export type QrScannerState = "loading" | "scanning" | "error" | "success"

interface QrScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (data: string) => void
  state?: QrScannerState
}

export default function QrScannerModal({ isOpen, onClose, onScanSuccess, state: externalState }: QrScannerModalProps) {
  const [internalState, setInternalState] = useState<QrScannerState>("loading")

  // Use external state if provided, otherwise use internal state
  const currentState = externalState || internalState

  useEffect(() => {
    if (isOpen) {
      setInternalState("loading")
      // Simulate camera initialization delay
      const timer = setTimeout(() => {
        setInternalState("scanning")
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleScanSuccess = (data: string) => {
    console.log("[v0] QR code scanned successfully:", data.substring(0, 50) + "...")
    setInternalState("success")

    // Show success state briefly before calling onScanSuccess
    setTimeout(() => {
      onScanSuccess(data)
    }, 1000)
  }

  const handleScanError = (error: string) => {
    console.error("[v0] QR scan error:", error)
    setInternalState("error")
  }

  const handleTryAgain = () => {
    setInternalState("loading")
    setTimeout(() => {
      setInternalState("scanning")
    }, 1000)
  }

  if (!isOpen) return null

  const renderContent = () => {
    switch (currentState) {
      case "loading":
        return (
          <div className="text-center py-12">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-6" />
            <p className="text-white text-lg">Preparing camera...</p>
          </div>
        )

      case "scanning":
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-6">Scan QR Code from Alby Hub</h2>

            <div className="relative bg-black rounded-lg overflow-hidden mx-auto w-80 h-80 mb-4">
              <QrScannerComponent onScanSuccess={handleScanSuccess} onScanError={handleScanError} />
            </div>

            <p className="text-slate-400 text-sm">Please grant camera permissions if prompted.</p>
          </div>
        )

      case "error":
        return (
          <div className="text-center py-12">
            <CameraOff className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white mb-4">Camera Access Denied</h2>
            <p className="text-slate-400 mb-6 max-w-sm mx-auto">
              Nostr Journal needs camera access to scan the QR code. Please enable camera permissions in your browser's
              site settings and try again.
            </p>
            <Button onClick={handleTryAgain} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2">
              Try Again
            </Button>
          </div>
        )

      case "success":
        return (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6 animate-pulse" />
            <p className="text-white text-lg">Code Scanned! Connecting...</p>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md relative">
        {/* Close button - always visible */}
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
          <X className="w-6 h-6" />
        </button>

        {renderContent()}
      </div>
    </div>
  )
}
