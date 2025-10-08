'use client';

import { Nip46RemoteSigner, type NostrSigner } from 'nostr-signer-connector';

let activeSigner: NostrSigner | null = null;

/**
 * Set the active signer instance
 */
export function setActiveSigner(signer: NostrSigner) {
  activeSigner = signer;
}

/**
 * Get the active signer instance
 */
export function getActiveSigner(): NostrSigner | null {
  return activeSigner;
}

/**
 * Resume a saved NIP-46 session
 */
export async function resumeNip46Session(sessionData: any): Promise<NostrSigner> {
  console.log('[SignerConnector] Resuming NIP-46 session...');
  
  const signer = await Nip46RemoteSigner.resumeSession(sessionData);
  
  setActiveSigner(signer);
  
  return signer;
}

/**
 * Sign an event with the active signer
 */
export async function signWithActiveSigner(unsignedEvent: any): Promise<any> {
  if (!activeSigner) {
    throw new Error('No active signer. Please connect first.');
  }
  
  return await activeSigner.signEvent(unsignedEvent);
}

/**
 * Get public key from active signer
 */
export async function getPublicKeyFromSigner(): Promise<string> {
  if (!activeSigner) {
    throw new Error('No active signer');
  }
  
  return await activeSigner.getPublicKey();
}

/**
 * Clear the active signer
 */
export function clearActiveSigner() {
  activeSigner = null;
  localStorage.removeItem('nostr_connect_session');
}
