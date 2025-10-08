'use client';

import React, { useState } from 'react';
import { Nip46RemoteSigner } from 'nostr-signer-connector';
import { Loader2, CheckCircle, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BunkerUrlConnectorProps {
  onConnectSuccess: (result: { 
    pubkey: string; 
    sessionData: any;
  }) => void;
  onClose: () => void;
}

export default function BunkerUrlConnector({ onConnectSuccess, onClose }: BunkerUrlConnectorProps) {
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleConnect = async () => {
    if (!bunkerUrl.startsWith('bunker://')) {
      setErrorMessage('Invalid bunker URL. Must start with bunker://');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');

    try {
      console.log('[BunkerConnector] 🔌 Connecting with bunker URL...');

      // CRITICAL: This library handles EVERYTHING correctly
      const { signer, session } = await Nip46RemoteSigner.connectToRemote(bunkerUrl);

      console.log('[BunkerConnector] ✅ Connected! Getting user pubkey...');

      // Get the actual user pubkey (not signer pubkey)
      const userPubkey = await signer.getPublicKey();

      console.log('[BunkerConnector] 👤 User pubkey:', userPubkey);

      // Store session for reconnection
      localStorage.setItem('nostr_connect_session', JSON.stringify(session));

      setStatus('success');

      onConnectSuccess({
        pubkey: userPubkey,
        sessionData: session
      });

    } catch (error) {
      console.error('[BunkerConnector] ❌ Connection failed:', error);
      setStatus('error');
      
      let errorMsg = 'Failed to connect. ';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMsg += 'Connection timed out. Ensure nsec.app is open and connected.';
        } else if (error.message.includes('relay')) {
          errorMsg += 'Could not connect to relay. Check your internet connection.';
        } else {
          errorMsg += error.message;
        }
      } else {
        errorMsg += 'Unknown error occurred.';
      }
      
      setErrorMessage(errorMsg);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LinkIcon className="h-5 w-5 text-purple-400" />
          <h3 className="text-white font-medium">Connect with Bunker URL</h3>
        </div>
        <p className="text-sm text-slate-400">
          Paste your bunker:// URL from nsec.app
        </p>
      </div>

      {status === 'idle' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Bunker URL</Label>
            <Input
              value={bunkerUrl}
              onChange={(e) => setBunkerUrl(e.target.value)}
              placeholder="bunker://...?relay=...&secret=..."
              className="bg-slate-700 border-slate-600 text-white font-mono text-sm"
              autoFocus
            />
          </div>

          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">
              <strong className="text-slate-300">How to get your bunker URL:</strong>
            </p>
            <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open nsec.app</li>
              <li>Go to "Connections" or "Apps"</li>
              <li>Create new connection</li>
              <li>Copy the bunker:// URL</li>
              <li>Paste it above</li>
            </ol>
          </div>

          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="flex-1 border-slate-600"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConnect} 
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={!bunkerUrl}
            >
              Connect
            </Button>
          </div>
        </div>
      )}

      {status === 'connecting' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <div className="text-center">
            <p className="text-slate-300 mb-2">Connecting to signing app...</p>
            <p className="text-xs text-slate-400">This may take up to 60 seconds</p>
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

          <Button 
            onClick={() => {
              setStatus('idle');
              setErrorMessage('');
            }} 
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
