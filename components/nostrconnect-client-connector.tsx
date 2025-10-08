'use client';

import React, { useState, useEffect } from 'react';
import { Nip46RemoteSigner, type Nip46ClientMetadata } from 'nostr-signer-connector';
import { Loader2, CheckCircle, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';

const NIP46_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.getalby.com/v1',
  'wss://nostr.mutinywallet.com'
];

interface NostrConnectClientConnectorProps {
  onConnectSuccess: (result: { 
    pubkey: string; 
    sessionData: any;
  }) => void;
  onClose: () => void;
}

export default function NostrConnectClientConnector({ onConnectSuccess, onClose }: NostrConnectClientConnectorProps) {
  const [status, setStatus] = useState<'generating' | 'awaiting_approval' | 'success' | 'error'>('generating');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectUri, setConnectUri] = useState('');

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const startConnection = async () => {
      try {
        console.log('[NostrConnect] 🚀 Starting client-initiated connection...');

        const clientMetadata: Nip46ClientMetadata = {
          name: 'Nostr Journal',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://nostrjournal.app',
          description: 'Private journaling on Nostr'
        };

        // CRITICAL: This library handles EVERYTHING correctly
        const { connectUri, established } = Nip46RemoteSigner.listenConnectionFromRemote(
          NIP46_RELAYS,
          clientMetadata
        );

        console.log('[NostrConnect] 📱 Generated connection URI');
        setConnectUri(connectUri);
        setStatus('awaiting_approval');

        // Wait for connection (with timeout)
        const timeout = setTimeout(() => {
          setStatus('error');
          setErrorMessage('Connection timeout. Please approve within 60 seconds.');
        }, 60000);

        cleanup = () => clearTimeout(timeout);

        // Wait for remote signer to connect
        const { signer, session } = await established;

        clearTimeout(timeout);

        console.log('[NostrConnect] ✅ Connected! Getting user pubkey...');

        // Get actual user pubkey
        const userPubkey = await signer.getPublicKey();

        console.log('[NostrConnect] 👤 User pubkey:', userPubkey);

        // Store session
        localStorage.setItem('nostr_connect_session', JSON.stringify(session));

        setStatus('success');

        onConnectSuccess({
          pubkey: userPubkey,
          sessionData: session
        });

      } catch (error) {
        console.error('[NostrConnect] ❌ Connection failed:', error);
        setStatus('error');
        setErrorMessage(
          error instanceof Error 
            ? error.message 
            : 'Connection failed. Please try again.'
        );
      }
    };

    startConnection();

    return () => {
      if (cleanup) cleanup();
    };
  }, [onConnectSuccess]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectUri);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleOpenInApp = () => {
    if (connectUri) {
      window.location.href = connectUri;
    }
  };

  return (
    <div className="space-y-4 p-6">
      {status === 'generating' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-300">Generating connection...</p>
        </div>
      )}

      {status === 'awaiting_approval' && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="text-white font-medium mb-2">Scan with Signing App</h3>
            <p className="text-sm text-slate-400">
              Use nsec.app, Alby, or Amethyst
            </p>
          </div>

          <div className="flex justify-center p-4 bg-white rounded-lg">
            <QRCodeSVG value={connectUri} size={200} level="M" />
          </div>

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
                className="border-slate-600"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={handleOpenInApp} className="w-full bg-green-600 hover:bg-green-700">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in Signing App
          </Button>

          <div className="flex items-center justify-center space-x-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-slate-400 text-sm">Waiting for approval...</span>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h3 className="text-white font-medium">Connected!</h3>
            <p className="text-slate-400 text-sm">Signing app is ready</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <h3 className="text-white font-medium">Connection Failed</h3>
            <p className="text-slate-400 text-sm text-center max-w-md">{errorMessage}</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => window.location.reload()} className="flex-1">
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
