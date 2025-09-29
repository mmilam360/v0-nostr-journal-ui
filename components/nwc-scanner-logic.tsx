"use client"
import { useState } from "react"
import { QrReader } from "react-qr-reader"

export default function NwcScannerLogic({
  onConnectSuccess,
  onClose,
}: { onConnectSuccess: (result: any) => void; onClose: () => void }) {
  const [debugText, setDebugText] = useState("[Point camera at a QR code]")
  const [status, setStatus] = useState("scanning")

  const handleQrReaderResult = (result: any) => {
    // This is the only logic. We just want to see what the scanner sees.
    if (result?.text) {
      setDebugText(result.text) // Update the state with the raw text from the scanner

      // We will also check if it's the right format and change the color
      if (result.text.startsWith("nostrconnect://")) {
        setStatus("valid_code_detected")
      }
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-center mb-4 text-white">Scanner Diagnostic Tool</h2>
      <div className="overflow-hidden rounded-lg bg-black">
        <QrReader
          onResult={handleQrReaderResult}
          constraints={{ facingMode: "environment" }}
          ViewFinder={() => (
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
              <div className="w-60 h-60 border-4 border-dashed border-white/50 rounded-2xl" />
            </div>
          )}
          className="w-full"
        />
      </div>

      {/* THIS IS THE IMPORTANT PART */}
      <div className="mt-4 p-4 rounded-md bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-400">LIVE SCANNER OUTPUT:</h3>
        <p
          className={`mt-2 break-words font-mono text-xs ${status === "valid_code_detected" ? "text-green-400" : "text-yellow-400"}`}
        >
          {debugText}
        </p>
      </div>
    </div>
  )
}
