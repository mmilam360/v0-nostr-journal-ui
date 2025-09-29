"use client"

import { useState } from "react"
import { Trash2, X, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Note } from "@/components/main-app"

interface DeleteConfirmationModalProps {
  note: Note
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirmationModal({ note, onConfirm, onCancel }: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{
    success: boolean
    error?: string
  } | null>(null)

  const handleConfirm = async () => {
    setIsDeleting(true)
    setDeleteResult(null)

    try {
      onConfirm()
      setDeleteResult({
        success: true,
      })

      // Auto-close after successful delete
      setTimeout(() => {
        onCancel()
      }, 1500)
    } catch (error) {
      setDeleteResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Delete Note</h2>
          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-700"
            disabled={isDeleting}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {deleteResult && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
              deleteResult.success ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"
            }`}
          >
            {deleteResult.success ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-green-300 font-medium">Note deleted successfully!</p>
                  <p className="text-slate-400 text-xs mt-1">The note has been removed from all devices</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-300 font-medium">Failed to delete</p>
                  <p className="text-red-400 text-sm mt-1">{deleteResult.error}</p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-6">
          <p className="text-slate-300 mb-4">Are you sure you want to delete this note?</p>

          <div className="bg-slate-900 border border-slate-600 rounded-lg p-4">
            <h3 className="text-slate-200 font-medium mb-2">{note.title || "Untitled Note"}</h3>
            <div className="text-slate-400 text-sm max-h-32 overflow-y-auto">
              {note.content ? (
                <div className="whitespace-pre-wrap break-words">
                  {note.content.length > 200 ? `${note.content.substring(0, 200)}...` : note.content}
                </div>
              ) : (
                "No content"
              )}
            </div>
            {note.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {!deleteResult && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-xs text-red-300 mb-1">⚠️ This action cannot be undone</p>
              <p className="text-xs text-red-400">
                The note will be permanently deleted from all your devices and cannot be recovered.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            onClick={onCancel}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
            disabled={isDeleting}
          >
            {deleteResult?.success ? "Close" : "Cancel"}
          </Button>
          {!deleteResult?.success && (
            <Button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "Deleting..." : "Delete Note"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
