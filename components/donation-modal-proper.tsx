"use client"

import { useState, useEffect } from "react"
import QRCode from 'qrcode'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Copy, Check, AlertCircle, Zap } from "lucide-react"

interface DonationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DonationModal({ open, onOpenChange }: DonationModalProps) {
  const lightningAddress = "michaelmilam@getalby.com"
  const [amount, setAmount] = useState<number>(5000)
  const [invoice, setInvoice] = useState<string>('')
  const [qrDataURL, setQrDataURL] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState(false)
  
  // Generate invoice when amount changes
  useEffect(() => {
    if (amount && amount > 0) {
      generateInvoice(amount)
    }
  }, [amount])
  
  const generateInvoice = async (sats: number) => {
    setIsGenerating(true)
    setError('')
    
    try {
      // Use LNURL-pay protocol to get real BOLT-11 invoice
      const [name, domain] = lightningAddress.split('@')
      
      // Fetch LNURL endpoint
      const lnurlResponse = await fetch(
        `https://${domain}/.well-known/lnurlp/${name}`
      )
      
      if (!lnurlResponse.ok) {
        throw new Error('Failed to fetch Lightning Address info')
      }
      
      const lnurlData = await lnurlResponse.json()
      
      // Check if amount is within limits
      const minSats = lnurlData.minSendable / 1000
      const maxSats = lnurlData.maxSendable / 1000
      
      if (sats < minSats || sats > maxSats) {
        throw new Error(`Amount must be between ${minSats} and ${maxSats} sats`)
      }
      
      // Request invoice
      const invoiceResponse = await fetch(
        `${lnurlData.callback}?amount=${sats * 1000}` // Convert to millisats
      )
      
      if (!invoiceResponse.ok) {
        throw new Error('Failed to generate invoice')
      }
      
      const invoiceData = await invoiceResponse.json()
      
      if (invoiceData.status === 'ERROR') {
        throw new Error(invoiceData.reason || 'Invoice generation failed')
      }
      
      const bolt11 = invoiceData.pr
      
      if (!bolt11 || !bolt11.toLowerCase().startsWith('ln')) {
        throw new Error('Invalid invoice format')
      }
      
      setInvoice(bolt11)
      
      // Generate QR code with proper settings for Lightning invoices
      const qrData = await QRCode.toDataURL(bolt11.toUpperCase(), {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 1,
        margin: 2,
        width: 400,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      
      setQrDataURL(qrData)
      
    } catch (err) {
      console.error('Invoice generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate invoice')
      setInvoice('')
      setQrDataURL('')
    } finally {
      setIsGenerating(false)
    }
  }
  
  const copyInvoice = async () => {
    if (!invoice) return
    
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Support Nostr Journal
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Supporting text */}
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
            <p className="text-sm text-amber-900 dark:text-amber-100 mb-2">
              <strong>This app is 100% funded by users like you.</strong>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
              No ads. No tracking. Just one dev who believes in Nostr's mission and Value for Value principles.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Your zaps help build features like image uploads, calendar view, and full-text search while keeping Nostr Journal free and independent.
            </p>
          </div>
          
          {/* Amount input */}
          <div>
            <p className="text-sm font-medium mb-3">Enter Amount (sats):</p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter amount in sats"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="1"
              />
              <Button onClick={() => generateInvoice(amount)}>
                Generate Invoice
              </Button>
            </div>
          </div>
          
          {/* QR Code Display */}
          <div className="flex flex-col items-center">
            {isGenerating && (
              <div className="w-[300px] h-[300px] flex flex-col items-center justify-center bg-secondary rounded-lg">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Generating invoice...</p>
              </div>
            )}
            
            {error && (
              <div className="w-full p-4 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-xs text-destructive/80">{error}</p>
                </div>
              </div>
            )}
            
            {qrDataURL && !isGenerating && !error && (
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-white rounded-lg border-4 border-gray-200">
                  <img 
                    src={qrDataURL} 
                    alt="Lightning Invoice QR Code" 
                    className="w-[300px] h-[300px]"
                  />
                </div>
                
                <p className="text-sm text-center text-muted-foreground">
                  Scan with your Lightning wallet
                </p>
                
                {/* Copy invoice button */}
                <div className="w-full">
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={copyInvoice}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Invoice
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {/* Thank you message */}
          <div className="text-xs text-center text-muted-foreground">
            <p>🙏 Thank you for supporting development in the Nostr network</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
