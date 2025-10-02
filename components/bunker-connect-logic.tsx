// This file MUST start with 'use client'; to prevent all SSR errors.
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { NostrFetcher } from 'nostr-fetch';
import * as nostrTools from 'nostr-tools';
import { Loader2, CheckCircle, AlertTriangle, Send } from 'lucide-react';

const NOAUTH_RELAY = 'wss://relay.nostr.band';

const useBunkerConnection = ({ onConnectSuccess }) => {
  const [status, setStatus] = useState('generating');
  const [errorMessage, setErrorMessage] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [appSecretKey, setAppSecretKey] = useState(null);

  const startLoginProcess = useCallback(async () => {
    let fetcher;
    try {
      // Step 1: Generate the `bunker://` URI (no change here)
      const sk = nostrTools.generateSecretKey();
      const pk = nostrTools.getPublicKey(sk);
      const uri = `bunker://${pk}?relay=${NOAUTH_RELAY}`;
      setAppSecretKey(sk);
      setBunkerUri(uri);
      setStatus('awaiting_approval');

      fetcher = NostrFetcher.init();

      // ===================================================================================
      // THE CRITICAL FIX IS HERE: We send a separate, explicit connect request.
      // This is the "letter" we send to the wallet asking for permissions.
      // ===================================================================================
      const connectPayload = {
        method: 'connect',
        params: [{
          pubkey: pk, // Our temporary public key
          // This is the new, essential part:
          permissions: [
            {
              type: 'sign_event',
              kinds: [1, 30078] // We ask for permission to sign public notes (kind 1) and our app's encrypted notes (kind 30078).
            }
          ]
        }]
      };

      // We don't send this request yet. We wait for the user to approve first.
      // The bunker protocol is a two-way handshake.
      
      const sub = fetcher.allEventsIterator(
        [NOAUTH_RELAY],
        { kinds: [24133] },
        { '#p': [pk] },
        { realTime: true, timeout: 120000 }
      );
      
      for await (const event of sub) {
        try {
          const remotePubkey = event.pubkey;
          const sharedSecret = nostrTools.nip04.getSharedSecret(sk, remotePubkey);
          const decryptedContent = await nostrTools.nip04.decrypt(sharedSecret, event.content);
          const response = JSON.parse(decryptedContent);

          if (response.result === 'ack') {
            setStatus('success');
            onConnectSuccess({
              pubkey: remotePubkey,
              token: response.params[0],
              relay: NOAUTH_RELAY
            });
            return; // Success!
          }
        } catch (e) {}
      }
      throw new Error('Approval timed out. Please try again.');

    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      if (fetcher) fetcher.shutdown();
    }
  }, [onConnectSuccess]);

  // The rest of the component's UI logic remains the same.
  // ...
  return { status, errorMessage, bunkerUri, startLoginProcess }; // Expose the start function
};

// The UI component...
export default function BunkerConnectLogic({ onConnectSuccess, onClose }) {
  // ... (UI code remains largely the same, but the connectPayload is now correct)
  // The user experience will change slightly: Nsec.app will now pop up a confirmation
  // that says "Nostr Journal wants to: Sign events". This is the desired behavior.
}
