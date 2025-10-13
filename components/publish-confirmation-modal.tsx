"use client"

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Globe, Zap, CheckCircle } from "lucide-react"

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date
  lastModified: Date
}

interface PublishConfirmationModalProps {
  note: Note
  onConfirm: () => void
  onCancel: () => void
}

export default function PublishConfirmationModal({ 
  note, 
  onConfirm, 
  onCancel 
}: PublishConfirmationModalProps) {
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            Publish to Nostr
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Warning message */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Public Post Warning
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This will publish your note as a <strong>public Kind 1 post</strong> to the Nostr network. 
                  Anyone can read it, and it will appear in your public feed.
                </p>
              </div>
            </div>
          </div>
          
          {/* Note preview */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Note Preview:</h4>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
              <h5 className="font-medium text-sm mb-2">{note.title}</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {note.content}
              </p>
              {note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {note.tags.map((tag, index) => (
                    <span 
                      key={index}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Publish to Nostr
            </Button>
          </div>
          
          {/* Additional info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Your note will be published as a Kind 1 event to Nostr relays
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
