"use client"

import { Inbox, Trash2, Hash } from "lucide-react"
import UserMenu from "@/components/user-menu"

interface TagsPanelProps {
  tags: string[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
  pubkey?: string
  onLogout?: () => void
}

export default function TagsPanel({ tags, selectedTag, onSelectTag, pubkey, onLogout }: TagsPanelProps) {
  return (
    <div className="w-64 bg-card/50 backdrop-blur-sm border-r border-cyan-500/30 flex flex-col h-full cyber-grid">
      {pubkey && onLogout && (
        <div className="border-b border-cyan-500/30">
          <UserMenu pubkey={pubkey} onLogout={onLogout} />
        </div>
      )}

      <div className="p-4 space-y-2">
        <button
          onClick={() => onSelectTag("all")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-300 hover-glow ${
            selectedTag === "all"
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 neon-glow"
              : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent"
          }`}
        >
          <Inbox className="w-4 h-4" />
          All Notes
        </button>

        <button
          onClick={() => onSelectTag("trash")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-300 hover-glow ${
            selectedTag === "trash"
              ? "bg-red-500/20 text-red-400 border border-red-500/50 neon-border-red"
              : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Trash
        </button>
      </div>

      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold cyber-text uppercase tracking-wider mb-2">TAGS</h3>

        <div className="space-y-1">
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm px-3 py-2">No tags created.</p>
          ) : (
            tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-300 hover-glow ${
                  selectedTag === tag
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 neon-glow"
                    : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent"
                }`}
              >
                <Hash className="w-4 h-4" />
                {tag}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}