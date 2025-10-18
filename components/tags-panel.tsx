"use client"

import { Inbox, Hash } from "lucide-react"
import UserMenu from "@/components/user-menu"
import DonationBubble from "@/components/donation-bubble"

interface TagsPanelProps {
  tags: string[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
  pubkey?: string
  onLogout?: () => void
  onDonationClick?: () => void
}

export default function TagsPanel({ tags, selectedTag, onSelectTag, pubkey, onLogout, onDonationClick }: TagsPanelProps) {
  return (
    <div className="w-64 bg-white dark:bg-card border-r border-border flex flex-col h-full">
      {pubkey && onLogout && (
        <div className="border-b border-border">
          <UserMenu pubkey={pubkey} onLogout={onLogout} />
        </div>
      )}

      <div className="p-4 space-y-2">
        <button
          onClick={() => onSelectTag("all")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-secondary ${
            selectedTag === "all"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Inbox className="w-4 h-4" />
          All Notes
        </button>

      </div>

      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">TAGS</h3>

        <div className="space-y-1">
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm px-3 py-2">No tags created.</p>
          ) : (
            tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-secondary ${
                  selectedTag === tag
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Hash className="w-4 h-4" />
                {tag}
              </button>
            ))
          )}
        </div>
      </div>
      
      {/* Donation Bubble - Bottom of left column */}
      <div className="mt-auto p-4 flex justify-center">
        <DonationBubble onClick={onDonationClick || (() => {})} />
      </div>
    </div>
  )
}