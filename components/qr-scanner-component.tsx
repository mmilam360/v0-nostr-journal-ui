"use client"

import { useEffect, useRef, useState } from "react"
import { Camera } from "lucide-react"

interface QrScannerComponentProps {
  onScanSuccess: (data: string) => void
  onScanError: (error: string) => void
}

export function QrScannerComponent({ onScanSuccess, onScanError }: QrScannerComponentProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    try {
      console.log("[NostrJournal] QrScannerComponent: Starting camera...")
      setIsLoading(true)

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      const constraints = {
        video: {
          facingMode: "environment", // Use back camera on mobile
          width: { ideal: 640, max: 1280 },
          height: { ideal: 640, max: 1280 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      console.log("[NostrJournal] QrScannerComponent: Camera stream obtained")

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.playsInline = true
        videoRef.current.muted = true
        videoRef.current.autoplay = true

        videoRef.current.onloadedmetadata = () => {
          console.log("[NostrJournal] QrScannerComponent: Video metadata loaded")
          setIsLoading(false)
          startScanning()
        }

        videoRef.current.onerror = (err) => {
          console.error("[v0] QrScannerComponent: Video error:", err)
          onScanError("Video playback error")
        }

        try {
          await videoRef.current.play()
          console.log("[NostrJournal] QrScannerComponent: Video playing")
        } catch (playError) {
          console.error("[v0] QrScannerComponent: Video play error:", playError)
        }
      }
    } catch (err) {
      console.error("[v0] QrScannerComponent: Camera access error:", err)
      onScanError("Unable to access camera. Please check permissions.")
    }
  }

  const stopCamera = () => {
    console.log("[NostrJournal] QrScannerComponent: Stopping camera...")

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
        console.log("[NostrJournal] QrScannerComponent: Stopped track:", track.kind)
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
  }

  const startScanning = () => {
    if (scanIntervalRef.current) return

    console.log("[NostrJournal] QrScannerComponent: Starting scan loop...")
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === 4) {
        try {
          const canvas = canvasRef.current
          const context = canvas.getContext("2d")
          if (!context) return

          // Set canvas size to match video
          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight

          if (canvas.width === 0 || canvas.height === 0) {
            return
          }

          // Draw current video frame to canvas
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

          // Get image data for QR scanning
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

          // TODO: Integrate with jsQR or react-qr-reader library here
          // For now, we'll use a placeholder that detects test patterns
          const qrResult = detectQRCode(imageData)
          if (qrResult) {
            console.log("[NostrJournal] QrScannerComponent: QR code detected:", qrResult.substring(0, 50) + "...")
            stopCamera()
            onScanSuccess(qrResult)
          }
        } catch (err) {
          console.error("[v0] QrScannerComponent: Scanning error:", err)
        }
      }
    }, 300) // Scan every 300ms
  }

  // Placeholder QR detection - replace with jsQR in production
  const detectQRCode = (imageData: ImageData): string | null => {
    // This is a placeholder implementation
    // In production, you would use: import jsQR from 'jsqr'
    // const code = jsQR(imageData.data, imageData.width, imageData.height)
    // return code ? code.data : null

    // For testing, we'll simulate QR detection with manual input
    // This allows testing the flow without a real QR library
    return null
  }

  return (
    <div className="relative w-full h-full">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      {/* Scanning overlay */}
      <div className="absolute inset-4 border-2 border-white/50 rounded-lg pointer-events-none">
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-green-400"></div>
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-green-400"></div>
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-green-400"></div>
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-green-400"></div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center">
            <Camera className="w-12 h-12 text-white mx-auto mb-2" />
            <p className="text-white text-sm">Loading camera...</p>
          </div>
        </div>
      )}
    </div>
  )
}
