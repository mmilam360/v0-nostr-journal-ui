"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Zap, Copy, Check, Heart, ExternalLink } from "lucide-react"

interface DonationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DonationModal({ open, onOpenChange }: DonationModalProps) {
  const lightningAddress = "mmilam@getalby.com" // Replace with your actual Lightning address
  const [copied, setCopied] = useState(false)
  const [customAmount, setCustomAmount] = useState("")
  
  const copyAddress = async () => {
    await navigator.clipboard.writeText(lightningAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const zapAmount = (sats: number) => {
    // Create Lightning URL (opens wallet)
    const zapUrl = `lightning:${lightningAddress}?amount=${sats}000`
    window.open(zapUrl, '_blank')
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Zap className="w-6 h-6 text-amber-500" />
            Love Nostr Journal?
          </DialogTitle>
          <DialogDescription className="text-base">
            Keep it free, open-source, and built for you
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-2">
          {/* Value prop */}
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
            <p className="text-sm text-amber-900 dark:text-amber-100 mb-2">
              <strong>This app is 100% funded by users like you.</strong>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              No VC money. No ads. No tracking. Just one dev who believes in Nostr's mission.
              Your zaps help build features like image uploads, calendar view, and full-text search.
            </p>
          </div>
          
          {/* Quick zap amounts */}
          <div>
            <p className="text-sm font-medium mb-2">Quick Zap:</p>
            <div className="grid grid-cols-3 gap-2">
              <Button 
                variant="outline" 
                onClick={() => zapAmount(1000)}
                className="flex flex-col h-auto py-3"
              >
                <span className="text-lg">⚡ 1k</span>
                <span className="text-xs text-muted-foreground">~$1</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => zapAmount(5000)}
                className="flex flex-col h-auto py-3 border-amber-500 dark:border-amber-600"
              >
                <span className="text-lg">⚡ 5k</span>
                <span className="text-xs text-muted-foreground">~$5 🔥</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => zapAmount(21000)}
                className="flex flex-col h-auto py-3"
              >
                <span className="text-lg">⚡ 21k</span>
                <span className="text-xs text-muted-foreground">~$21</span>
              </Button>
            </div>
          </div>
          
          {/* Custom amount */}
          <div>
            <p className="text-sm font-medium mb-2">Custom Amount:</p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter sats"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
              <Button 
                onClick={() => customAmount && zapAmount(Number(customAmount))}
                disabled={!customAmount}
                className="gap-1"
              >
                <Zap className="w-4 h-4" />
                Zap
              </Button>
            </div>
          </div>
          
          {/* Lightning address */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              Or copy Lightning Address:
            </p>
            <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
              <code className="flex-1 text-xs font-mono break-all">
                {lightningAddress}
              </code>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={copyAddress}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Thank you message */}
          <p className="text-xs text-center text-muted-foreground pt-2">
            🙏 Thank you for supporting independent Nostr development
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
