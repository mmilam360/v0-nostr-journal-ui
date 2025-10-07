'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { 
  User, 
  Server, 
  Key, 
  Radio, 
  Shield, 
  Lock, 
  Globe, 
  Zap, 
  Edit3, 
  ChevronRight, 
  ExternalLink,
  X
} from 'lucide-react'

interface InfoModalProps {
  onClose: () => void
}

export default function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold">What is Nostr?</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Section 1: What is Nostr? */}
          <div>
            <h3 className="font-semibold mb-3">What is Nostr?</h3>
            <p className="text-muted-foreground leading-relaxed">
              Nostr is an open protocol for decentralized social networks and applications. 
              Instead of storing your data on a company's servers, Nostr uses a network of 
              relays that sync your encrypted content. You control your identity through 
              cryptographic keys - no passwords, no company accounts, just you and your data.
            </p>
          </div>

          {/* Section 2: Comparison Diagram */}
          <div>
            <h3 className="font-semibold mb-4">Traditional vs Nostr Storage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Traditional */}
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h4 className="font-semibold text-lg mb-1">Traditional Notes</h4>
                  <div className="h-px bg-border w-full"></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Server className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-sm">Company Servers</span>
                  </div>
                  <div className="ml-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">Holds your keys</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">Can lock you out</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">Data trapped inside</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">└</span>
                      <span className="text-sm text-muted-foreground">Company can shut down</span>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200 text-center">
                      "Trust us forever"
                    </p>
                  </div>
                </div>
              </div>

              {/* Nostr */}
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h4 className="font-semibold text-lg mb-1">Nostr Journal</h4>
                  <div className="h-px bg-border w-full"></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-green-500" />
                    </div>
                    <span className="text-sm">Open Network</span>
                  </div>
                  <div className="ml-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">You hold keys</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">Can't be banned</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">├</span>
                      <span className="text-sm text-muted-foreground">Data portable</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">└</span>
                      <span className="text-sm text-muted-foreground">Network stays up</span>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 text-center">
                      "Trust yourself"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Why Nostr Journal? */}
          <div>
            <h3 className="font-semibold mb-4">Why Nostr Journal?</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium">Your data, your control</h4>
                  <p className="text-sm text-muted-foreground">
                    You own your keys, you own your notes. No company can lock you out.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium">Encrypted by default</h4>
                  <p className="text-sm text-muted-foreground">
                    Your notes are encrypted before leaving your device. Only you can read them.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium">Access from anywhere</h4>
                  <p className="text-sm text-muted-foreground">
                    Your notes sync across all your devices through multiple relays.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium">No accounts or passwords</h4>
                  <p className="text-sm text-muted-foreground">
                    Just your cryptographic keys. Simple, secure, and censorship-resistant.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: How it Works */}
          <div>
            <h3 className="font-semibold mb-4">How Nostr Journal Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                  <Edit3 className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm font-medium">Write Note</p>
                <p className="text-xs text-muted-foreground">On your device</p>
              </div>
              
              <ChevronRight className="text-muted-foreground hidden md:block" />
              
              <div className="flex-1 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm font-medium">Encrypt</p>
                <p className="text-xs text-muted-foreground">With your keys</p>
              </div>
              
              <ChevronRight className="text-muted-foreground hidden md:block" />
              
              <div className="flex-1 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                  <Radio className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm font-medium">Sync</p>
                <p className="text-xs text-muted-foreground">To Nostr relays</p>
              </div>
            </div>
          </div>

          {/* Section 5: Learn More Links */}
          <div className="border-t border-border pt-6">
            <h4 className="font-semibold mb-3">Learn More About Nostr</h4>
            <div className="space-y-2">
              <a 
                href="https://nostr.com" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Official Nostr Website
              </a>
              <a 
                href="https://github.com/nostr-protocol/nostr" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Nostr Protocol Specification
              </a>
              <a 
                href="https://nostr.how" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Getting Started with Nostr
              </a>
            </div>
          </div>

          {/* Section 6: Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
