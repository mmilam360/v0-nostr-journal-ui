// This file should start with 'use client'; if it uses browser-specific APIs like window.nostr
'use client';

import * as nostrTools from 'nostr-tools';

// This function can remain as it is in your current code.
export const createNostrEvent = async (pubkey, content, tags = []) => {
  const event = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags.map(tag => ["t", tag]),
    content: content,
    pubkey: pubkey,
  };
  return event;
};

// ===================================================================================
// THIS IS THE CRITICAL, UPGRADED FUNCTION
// ===================================================================================
export const publishToNostr = async (unsignedEvent, authData) => {
  console.log("[v0] Publishing event with auth method:", authData.authMethod);

  let signedEvent;

  switch (authData.authMethod) {
    case 'nsec':
      // This is your existing, working logic for nsec logins.
      if (!authData.privateKey) {
        throw new Error("Private key is missing for nsec login method.");
      }
      const privateKeyBytes = new Uint8Array(authData.privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
      signedEvent = nostrTools.finalizeEvent(unsignedEvent, privateKeyBytes);
      break;

    case 'remote':
      // THIS IS THE CRITICAL NEW LOGIC FOR REMOTE SIGNERS
      if (!authData.signer) {
        throw new Error("Remote signer is not available. Please reconnect.");
      }
      console.log("[v0] Requesting signature from remote signer...");
      // The remoteSigner object should have a `signEvent` method compliant with NIP-46.
      // This will trigger the confirmation popup in Nsec.app or Alby.
      signedEvent = await authData.signer.signEvent(unsignedEvent);
      console.log("[v0] Received signed event from remote signer.");
      break;

    case 'extension':
      // THIS IS THE LOGIC FOR BROWSER EXTENSIONS
      if (typeof window.nostr === 'undefined') {
        throw new Error("Nostr browser extension not found.");
      }
      console.log("[v0] Requesting signature from browser extension...");
      signedEvent = await window.nostr.signEvent(unsignedEvent);
      console.log("[v0] Received signed event from browser extension.");
      break;

    default:
      throw new Error("Unsupported authentication method for publishing.");
  }

  if (!signedEvent) {
    throw new Error("Event signing failed.");
  }

  // Now, publish the universally signed event.
  const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.nostr.band'];
  const pool = new nostrTools.SimplePool();

  try {
    await Promise.any(pool.publish(relays, signedEvent));
    console.log("[v0] Event published to at least one relay.");
  } catch (error) {
    console.error("[v0] Failed to publish event to any relay:", error);
    throw new Error("Failed to publish event to the Nostr network.");
  } finally {
    pool.close(relays);
  }

  return signedEvent.id;
};
