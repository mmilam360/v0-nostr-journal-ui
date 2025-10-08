'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { nip04 } from 'nostr-tools';
import { Loader2, CheckCircle, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';

// CRITICAL: Multiple NIP-46 optimized relays for mobile reliability
const NIP46_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.getalby.com/v1',
  'wss://nostr.mutinywallet.com'
];

interface NostrConnectClientLogicProps {
  onConnectSuccess: (result: { pubkey: string; token: string; relay: string }) => void;
  onClose: () => void;
}

export default function NostrConnectClientLogic({ onConnectSuccess, onClose }: NostrConnectClientLogicProps) {
  const [status, setStatus] = useState<'generating' | 'awaiting_approval' | 'success' | 'error'>('generating');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectUri, setConnectUri] = useState('');
  const [clientPubkey, setClientPubkey] = useState('');
  
  const clientSecretKeyRef = useRef<Uint8Array | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<any>(null);

  const startConnection = useCallback(async () => {
    try {
      console.log('[NostrConnect] 🚀 Starting client-initiated connection flow...');

      // STEP 1: Generate CLIENT keypair (ephemeral, disposable for this session)
      const clientSecretKey = generateSecretKey();
      const clientPubkey = getPublicKey(clientSecretKey);
      
      clientSecretKeyRef.current = clientSecretKey;
      setClientPubkey(clientPubkey);

      console.log('[NostrConnect] 🔑 Client pubkey:', clientPubkey);

      // STEP 2: Create nostrconnect:// URI (NOT bunker://)
      const metadata = {
        name: 'Nostr Journal',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://nostrjournal.app',
        description: 'Private journaling on Nostr'
      };

      // CRITICAL: Use nostrconnect:// prefix for client-initiated flow
      const uri = `nostrconnect://${clientPubkey}?` +
        NIP46_RELAYS.map(r => `relay=${encodeURIComponent(r)}`).join('&') +
        `&metadata=${encodeURIComponent(JSON.stringify(metadata))}`;

      console.log('[NostrConnect] 📱 Generated nostrconnect URI');
      setConnectUri(uri);
      setStatus('awaiting_approval');

      // STEP 3: Connect to relays
      const pool = new SimplePool();
      poolRef.current = pool;

      console.log('[NostrConnect] 📡 Connecting to relays:', NIP46_RELAYS);

      // STEP 4: Subscribe with "since" filter (CRITICAL for mobile)
      const now = Math.floor(Date.now() / 1000);
      
      const sub = pool.subscribeMany(
        NIP46_RELAYS,
        [{
          kinds: [24133],
          '#p': [clientPubkey],
          since: now - 10  // Only events from last 10 seconds
        }],
        {
          onevent: async (event) => {
            try {
              console.log('[NostrConnect] 📨 Received event from signer:', event.pubkey);
              
              // STEP 5: Decrypt the response
              const signerPubkey = event.pubkey;
              const sharedSecret = nip04.getSharedSecret(clientSecretKey, signerPubkey);
              const decryptedContent = await nip04.decrypt(sharedSecret, event.content);
              const response = JSON.parse(decryptedContent);

              console.log('[NostrConnect] 📦 Decrypted response:', response);

              // STEP 6: Handle connection acknowledgment
              if (response.result === 'ack' || response.method === 'connect') {
                console.log('[NostrConnect] ✅ Connection ACK received!');
                
                // CRITICAL: signerPubkey is the SIGNER app's pubkey, NOT user's!
                // We MUST call get_public_key to get the actual user pubkey
                console.log('[NostrConnect] 🔍 Requesting user pubkey via get_public_key...');
                
                const getUserPubkeyRequest = {
                  id: Date.now().toString(),
                  method: 'get_public_key',
                  params: []
                };

                const encryptedRequest = await nip04.encrypt(
                  sharedSecret,
                  JSON.stringify(getUserPubkeyRequest)
                );

                // Create and sign the request event
                const requestEvent = {
                  kind: 24133,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [['p', signerPubkey]],
                  content: encryptedRequest,
                  pubkey: clientPubkey
                };

                const { finalizeEvent } = await import('nostr-tools/pure');
                const signedRequest = finalizeEvent(requestEvent, clientSecretKey);
                
                await pool.publish(NIP46_RELAYS, signedRequest);
                console.log('[NostrConnect] 📤 Sent get_public_key request');

              } else if (response.result && typeof response.result === 'string' && response.result.length === 64) {
                // STEP 7: This is the user's pubkey response
                const userPubkey = response.result;
                console.log('[NostrConnect] 👤 Got USER pubkey:', userPubkey);

                setStatus('success');
                
                // Clean up
                sub.close();
                pool.close(NIP46_RELAYS);
                
                onConnectSuccess({
                  pubkey: userPubkey,
                  token: response.params?.[0] || '',
                  relay: NIP46_RELAYS[0]
                });
              } else if (response.error) {
                throw new Error(response.error);
              }
            } catch (err) {
              console.error('[NostrConnect] ❌ Error processing event:', err);
            }
          },
          oneose: () => {
            console.log('[NostrConnect] 📡 Subscription established on relays');
          }
        }
      );

      subRef.current = sub;

      // STEP 8: Mobile-friendly 60 second timeout
      setTimeout(() => {
        if (status === 'awaiting_approval') {
          console.log('[NostrConnect] ⏰ Connection timeout (60s)');
          sub.close();
          pool.close(NIP46_RELAYS);
          setStatus('error');
          setErrorMessage('Connection timeout. Please approve within 60 seconds and ensure nsec.app is connected to the internet.');
        }
      }, 60000);

    } catch (error) {
      console.error('[NostrConnect] ❌ Connection error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [onConnectSuccess, status]);

  useEffect(() => {
    startConnection();

    return () => {
      console.log('[NostrConnect] 🧹 Cleaning up...');
      if (subRef.current) {
        subRef.current.close();
      }
      if (poolRef.current) {
        poolRef.current.close(NIP46_RELAYS);
      }
    };
  }, [startConnection]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectUri);
      console.log('[NostrConnect] 📋 Copied to clipboard');
    } catch (error) {
      console.error('[NostrConnect] Failed to copy:', error);
    }
  };

  const handleOpenInApp = () => {
    if (connectUri) {
      window.location.href = connectUri;
    }
  };

  return (
    <div className="space-y-4">
      {/* GENERATING STATE */}
      {status === 'generating' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-300">Generating secure connection...</p>
        </div>
      )}

      {/* AWAITING APPROVAL STATE */}
      {status === 'awaiting_approval' && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="text-white font-medium mb-2">Scan with Signing App</h3>
            <p className="text-sm text-slate-400">
              Use Nsec.app, Alby, or Amethyst to connect
            </p>
          </div>

          {/* QR CODE */}
          <div className="flex justify-center p-4 bg-white rounded-lg">
            <QRCodeSVG value={connectUri} size={200} level="M" />
          </div>

          {/* CONNECTION STRING */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Or copy connection string:</Label>
            <div className="flex space-x-2">
              <Input
                value={connectUri}
                readOnly
                className="bg-slate-700 border-slate-600 text-white text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="border-slate-600 text-slate-300"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* OPEN IN APP BUTTON */}
          <Button onClick={handleOpenInApp} className="w-full bg-green-600 hover:bg-green-700">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in Signing App
          </Button>

          {/* WAITING INDICATOR */}
          <div className="flex items-center justify-center space-x-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-slate-400 text-sm">Waiting for approval (60s timeout)...</span>
          </div>

          {/* INSTRUCTIONS */}
          <div className="bg-slate-700/50 rounded-lg p-4 text-xs text-slate-400">
            <p className="font-medium text-slate-300 mb-2">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open nsec.app on your mobile device</li>
              <li>Tap "Connect" or scan the QR code</li>
              <li>Paste the connection string if scanning doesn't work</li>
              <li>Approve the connection in nsec.app</li>
            </ol>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {status === 'success' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connection Successful!</h3>
            <p className="text-slate-400 text-sm">Your signing app is now connected</p>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {status === 'error' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <AlertTriangle className="h-12 w-12 text-red-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connection Failed</h3>
            <p className="text-slate-400 text-sm max-w-md">{errorMessage}</p>
          </div>
          <div className="flex space-x-2 w-full">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="flex-1 border-slate-600"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setStatus('generating');
                setErrorMessage('');
                startConnection();
              }} 
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
