"use client"

import * as nostrTools from "nostr-tools"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export function validateEvent(event: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!event.id) {
    errors.push("Event ID is missing")
  } else if (typeof event.id !== 'string' || event.id.length !== 64) {
    errors.push("Event ID must be a 64-character hex string")
  }

  if (!event.sig) {
    errors.push("Event signature is missing")
  } else if (typeof event.sig !== 'string' || event.sig.length !== 128) {
    errors.push("Event signature must be a 128-character hex string")
  }

  if (!event.pubkey) {
    errors.push("Event pubkey is missing")
  } else if (typeof event.pubkey !== 'string' || event.pubkey.length !== 64) {
    errors.push("Event pubkey must be a 64-character hex string")
  }

  if (typeof event.kind !== 'number') {
    errors.push("Event kind must be a number")
  }

  if (typeof event.created_at !== 'number') {
    errors.push("Event created_at must be a number")
  } else {
    const now = Math.floor(Date.now() / 1000)
    const eventTime = event.created_at
    const timeDiff = Math.abs(now - eventTime)
    
    if (timeDiff > 3600) { // More than 1 hour difference
      warnings.push(`Event timestamp is ${Math.floor(timeDiff / 60)} minutes from now`)
    }
  }

  if (!Array.isArray(event.tags)) {
    errors.push("Event tags must be an array")
  }

  if (typeof event.content !== 'string') {
    errors.push("Event content must be a string")
  }

  // Validate signature if possible
  if (event.id && event.sig && event.pubkey && errors.length === 0) {
    try {
      const isValidSig = nostrTools.verifySignature(event)
      if (!isValidSig) {
        errors.push("Event signature is invalid")
      }
    } catch (error) {
      warnings.push("Could not verify signature: " + (error instanceof Error ? error.message : "Unknown error"))
    }
  }

  // Check for common issues
  if (event.content && event.content.length > 100000) {
    warnings.push("Event content is very large (" + event.content.length + " characters)")
  }

  if (event.tags && event.tags.length > 2000) {
    warnings.push("Event has many tags (" + event.tags.length + ")")
  }

  // Check for kind-specific requirements
  if (event.kind === 30078) { // Parameterized replaceable event
    const dTag = event.tags?.find((tag: any[]) => tag[0] === 'd')
    if (!dTag || !dTag[1]) {
      errors.push("Kind 30078 events must have a 'd' tag")
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

export function logValidationResult(event: any, result: ValidationResult): void {
  console.log("[Validator] 🔍 Event validation result:")
  console.log("[Validator] Valid:", result.isValid)
  
  if (result.errors.length > 0) {
    console.error("[Validator] ❌ Errors:")
    result.errors.forEach(error => console.error("  -", error))
  }
  
  if (result.warnings.length > 0) {
    console.warn("[Validator] ⚠️ Warnings:")
    result.warnings.forEach(warning => console.warn("  -", warning))
  }
  
  if (result.isValid) {
    console.log("[Validator] ✅ Event is valid and ready to publish")
  }
}
