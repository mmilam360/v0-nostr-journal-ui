// This file MUST start with 'use client'; to prevent all SSR errors.
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { NostrFetcher } from 'nostr-fetch';
import * as nostrTools from 'nostr-tools';
import { Loader2, CheckCircle, AlertTriangle, Send, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const NOAUTH_RELAY = 'wss://relay.nostr.band';

const useBunkerConnection = ({ onConnectSuccess }) => {
  const [status, setStatus] = useState('generating');
  const [errorMessage, setErrorMessage] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [appSecretKey, setAppSecretKey] = useState(null);

  const startLoginProcess = useCallback(async () => {
    let fetcher;
    try {
      // Step 1: Generate the `bunker://` URI
      const sk = nostrTools.generateSecretKey();
      const pk = nostrTools.getPublicKey(sk);
      const uri = `bunker://${pk}?relay=${NOAUTH_RELAY}`;
      setAppSecretKey(sk);
      setBunkerUri(uri);
      setStatus('awaiting_approval');

      fetcher = NostrFetcher.init();

      console.log('[Bunker] 📡 Listening for approval on relay:', NOAUTH_RELAY);
      
      const sub = fetcher.allEventsIterator(
        [NOAUTH_RELAY],
        { kinds: [24133] },
        { '#p': [pk] },
        { realTime: true, timeout: 120000 }
      );
      
      for await (const event of sub) {
        try {
          console.log('[Bunker] 📨 Received event from:', event.pubkey);
          
          const remotePubkey = event.pubkey;
          const sharedSecret = nostrTools.nip04.getSharedSecret(sk, remotePubkey);
          const decryptedContent = await nostrTools.nip04.decrypt(sharedSecret, event.content);
          const response = JSON.parse(decryptedContent);

          console.log('[Bunker] 📦 Decrypted response:', response);

          if (response.result === 'ack') {
            console.log('[Bunker] ✅ Connection approved!');
            setStatus('success');
            onConnectSuccess({
              pubkey: remotePubkey,
              token: response.params?.[0] || '',
              relay: NOAUTH_RELAY
            });
            return; // Success!
          } else if (response.error) {
            throw new Error(response.error.message || 'Connection rejected');
          }
        } catch (e) {
          console.log('[Bunker] ⚠️ Could not decrypt event:', e);
        }
      }
      throw new Error('Approval timed out. Please try again.');

    } catch (error) {
      console.error('[Bunker] ❌ Connection error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      if (fetcher) fetcher.shutdown();
    }
  }, [onConnectSuccess]);

  return { status, errorMessage, bunkerUri, startLoginProcess };
};

// The UI component
export default function BunkerConnectLogic({ onConnectSuccess, onClose }) {
  const { status, errorMessage, bunkerUri, startLoginProcess } = useBunkerConnection({ onConnectSuccess });

  useEffect(() => {
    startLoginProcess();
  }, [startLoginProcess]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bunkerUri);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleOpenInApp = () => {
    if (bunkerUri) {
      window.location.href = bunkerUri;
    }
  };

  const handleTryAgain = () => {
    startLoginProcess();
  };

  const handleSuccess = () => {
    onConnectSuccess({
      pubkey: 'temp', // This will be set by the connection logic
      token: '',
      relay: NOAUTH_RELAY
    });
  };

  return (
    <div className="space-y-4">
      {/* Generating State */}
      {status === 'generating' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-300">Generating secure connection...</p>
        </div>
      )}

      {/* Awaiting Approval State */}
      {status === 'awaiting_approval' && (
        <div className="space-y-4">
          {/* Connection String */}
          <div className="space-y-2">
            <Label className="text-slate-300">Connection String</Label>
            <div className="flex space-x-2">
              <Input
                value={bunkerUri}
                readOnly
                className="bg-slate-700 border-slate-600 text-white text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button onClick={handleOpenInApp} className="w-full bg-green-600 hover:bg-green-700 text-white">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Signing App
            </Button>

            <div className="flex items-center justify-center space-x-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Waiting for approval...</span>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">Instructions:</h4>
            <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
              <li>Copy the connection string above</li>
              <li>Open your signing app (like Nsec.app)</li>
              <li>Paste the connection string in your app</li>
              <li>Approve the connection request</li>
            </ol>
          </div>
        </div>
      )}

      {/* Success State */}
      {status === 'success' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connection Successful!</h3>
            <p className="text-slate-400 text-sm">Your signing app is now connected</p>
          </div>
          <Button onClick={handleSuccess} className="w-full bg-green-600 hover:bg-green-700 text-white">
            Continue to Journal
          </Button>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <AlertTriangle className="h-12 w-12 text-red-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connection Failed</h3>
            <p className="text-slate-400 text-sm">{errorMessage}</p>
          </div>
          <div className="flex space-x-2 w-full">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
            >
              Cancel
            </Button>
            <Button onClick={handleTryAgain} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
