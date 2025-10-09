import type { Note } from "@/components/main-app"

export function isValidNote(obj: any): obj is Note {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.id === "string" &&
    typeof obj.title === "string" &&
    typeof obj.content === "string" &&
    Array.isArray(obj.tags) &&
    obj.tags.every((tag: any) => typeof tag === "string") &&
    (obj.createdAt instanceof Date || typeof obj.createdAt === "string") &&
    (obj.lastModified instanceof Date || typeof obj.lastModified === "string")
  )
}

export function sanitizeNote(note: any): Note | null {
  try {
    if (!isValidNote(note)) {
      console.warn("[Validator] Invalid note structure:", note)
      return null
    }

    return {
      id: String(note.id),
      title: String(note.title),
      content: String(note.content),
      tags: note.tags.filter((tag: any) => typeof tag === "string"),
      createdAt: note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt),
      lastModified: note.lastModified instanceof Date ? note.lastModified : new Date(note.lastModified),
      lastSynced: note.lastSynced ? (note.lastSynced instanceof Date ? note.lastSynced : new Date(note.lastSynced)) : undefined,
      syncStatus: note.syncStatus || "local",
      syncError: note.syncError,
      // Preserve new sync properties
      eventId: note.eventId,
      eventKind: note.eventKind,
      isSynced: note.isSynced,
      publishedToRelays: note.publishedToRelays,
      fetchedFromRelays: note.fetchedFromRelays,
    }
  } catch (error) {
    console.error("[Validator] Error sanitizing note:", error)
    return null
  }
}

export function sanitizeNotes(notes: any[]): Note[] {
  if (!Array.isArray(notes)) {
    console.warn("[Validator] Notes is not an array:", typeof notes)
    return []
  }

  console.log("[Validator] Sanitizing notes, input count:", notes.length)
  console.log("[Validator] Input note IDs:", notes.map(n => n?.id))
  
  const sanitized = notes
    .map(sanitizeNote)
    .filter((note): note is Note => note !== null)
  
  console.log("[Validator] Sanitized notes, output count:", sanitized.length)
  console.log("[Validator] Output note IDs:", sanitized.map(n => n.id))
  
  return sanitized
}
