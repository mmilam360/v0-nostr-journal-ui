'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { nip04 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { Loader2, CheckCircle, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QRCodeSVG } from 'qrcode.react';

// Use reliable relays like 0xchat does
const RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://nos.lol'
];

interface Nip46ConnectProps {
  onConnectSuccess: (result: { 
    pubkey: string; 
    clientSecretKey: Uint8Array;
    bunkerUri: string;
  }) => void;
  onClose: () => void;
}

export default function Nip46Connect({ onConnectSuccess, onClose }: Nip46ConnectProps) {
  const [status, setStatus] = useState<'generating' | 'waiting' | 'success' | 'error'>('generating');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectUri, setConnectUri] = useState('');
  
  const clientSecretKeyRef = useRef<Uint8Array | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<any>(null);

  const startConnection = useCallback(async () => {
    try {
      console.log('[NIP-46] 🚀 Starting NIP-46 connection...');

      // Generate client keypair
      const clientSecretKey = generateSecretKey();
      const clientPubkey = getPublicKey(clientSecretKey);
      clientSecretKeyRef.current = clientSecretKey;

      console.log('[NIP-46] 🔑 Client pubkey:', clientPubkey);

      // Create nostrconnect URI - simple and standard
      const relayParam = RELAYS.map(r => `relay=${encodeURIComponent(r)}`).join('&');
      const uri = `nostrconnect://${clientPubkey}?${relayParam}&metadata=${encodeURIComponent(JSON.stringify({
        name: 'Nostr Journal',
        url: window.location.origin,
        description: 'Private journaling on Nostr'
      }))}`;

      console.log('[NIP-46] 📱 Generated nostrconnect URI');
      setConnectUri(uri);
      setStatus('waiting');

      // Connect to relays
      const pool = new SimplePool();
      poolRef.current = pool;

      console.log('[NIP-46] 📡 Connecting to relays:', RELAYS);

      // Subscribe to NIP-46 events - keep it simple like 0xchat
      const sub = pool.subscribeMany(
        RELAYS,
        [{
          kinds: [24133],
          '#p': [clientPubkey],
          since: Math.floor(Date.now() / 1000) - 30 // 30 seconds window
        }],
        {
          onevent: async (event) => {
            try {
              console.log('[NIP-46] 📨 Received event:', event.id);
              
              // Decrypt response
              const sharedSecret = nip04.getSharedSecret(clientSecretKey, event.pubkey);
              const decryptedContent = await nip04.decrypt(sharedSecret, event.content);
              const response = JSON.parse(decryptedContent);

              console.log('[NIP-46] 📦 Response:', response);

              // Handle different response types
              if (response.result === 'ack') {
                console.log('[NIP-46] ✅ Connection acknowledged');
                // Connection established, now get user pubkey
                const getUserPubkeyRequest = {
                  id: Date.now().toString(),
                  method: 'get_public_key',
                  params: []
                };

                const encryptedRequest = await nip04.encrypt(
                  sharedSecret,
                  JSON.stringify(getUserPubkeyRequest)
                );

                const requestEvent = {
                  kind: 24133,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [['p', event.pubkey]],
                  content: encryptedRequest,
                  pubkey: clientPubkey
                };

                const signedRequest = finalizeEvent(requestEvent, clientSecretKey);
                await pool.publish(RELAYS, signedRequest);
                console.log('[NIP-46] 📤 Requested user pubkey');

              } else if (response.result && typeof response.result === 'string' && response.result.length === 64) {
                // This is the user's pubkey
                const userPubkey = response.result;
                console.log('[NIP-46] 👤 Got user pubkey:', userPubkey);

                setStatus('success');
                
                // Clean up
                if (subRef.current) {
                  subRef.current.close();
                }
                pool.close(RELAYS);
                
                // Return success
                onConnectSuccess({
                  pubkey: userPubkey,
                  clientSecretKey: clientSecretKey,
                  bunkerUri: uri
                });
              } else if (response.error) {
                throw new Error(response.error);
              }
            } catch (err) {
              console.error('[NIP-46] ❌ Error processing event:', err);
            }
          },
          oneose: () => {
            console.log('[NIP-46] 📡 Subscription established');
          }
        }
      );

      subRef.current = sub;

      // 90 second timeout - reasonable for mobile
      setTimeout(() => {
        if (status === 'waiting') {
          console.log('[NIP-46] ⏰ Timeout');
          sub.close();
          pool.close(RELAYS);
          setStatus('error');
          setErrorMessage('Connection timeout. Please approve the connection in your signing app.');
        }
      }, 90000);

    } catch (error) {
      console.error('[NIP-46] ❌ Connection error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [onConnectSuccess, status]);

  useEffect(() => {
    startConnection();

    return () => {
      console.log('[NIP-46] 🧹 Cleaning up...');
      if (subRef.current) {
        subRef.current.close();
      }
      if (poolRef.current) {
        poolRef.current.close(RELAYS);
      }
    };
  }, [startConnection]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectUri);
    } catch (error) {
      console.error('[NIP-46] Failed to copy:', error);
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

      {/* WAITING STATE */}
      {status === 'waiting' && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="text-white font-medium mb-2">Connect with Signing App</h3>
            <p className="text-sm text-slate-400">
              Use 0xchat, Nsec.app, Alby, or Amethyst
            </p>
          </div>

          {/* QR CODE */}
          <div className="flex justify-center p-4 bg-white rounded-lg">
            <QRCodeSVG value={connectUri} size={200} level="M" />
          </div>

          {/* CONNECTION STRING */}
          <div className="space-y-2">
            <label className="text-slate-300 text-xs">Or copy connection string:</label>
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
            <span className="text-slate-400 text-sm">Waiting for approval...</span>
          </div>

          {/* INSTRUCTIONS */}
          <div className="bg-slate-700/50 rounded-lg p-4 text-xs text-slate-400">
            <p className="font-medium text-slate-300 mb-2">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open your signing app (0xchat, Nsec.app, etc.)</li>
              <li>Tap "Connect" or scan the QR code</li>
              <li>Paste the connection string if scanning doesn't work</li>
              <li>Approve the connection in your signing app</li>
            </ol>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {status === 'success' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connected!</h3>
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
