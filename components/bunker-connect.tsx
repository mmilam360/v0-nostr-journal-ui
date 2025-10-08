'use client';

import React, { useState } from 'react';
import { BunkerSigner } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey } from 'nostr-tools/pure';
import { Loader2, CheckCircle, AlertTriangle, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BunkerConnectProps {
  onConnectSuccess: (result: { 
    pubkey: string; 
    clientSecretKey: string;
    bunkerUri: string;
  }) => void;
  onClose: () => void;
}

export default function BunkerConnect({ onConnectSuccess, onClose }: BunkerConnectProps) {
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleConnect = async () => {
    // Validate URL format
    if (!bunkerUrl.startsWith('bunker://')) {
      setErrorMessage('Invalid bunker URL. Must start with bunker://');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');

    try {
      console.log('[BunkerConnect] 🔌 Starting bunker connection...');
      console.log('[BunkerConnect] 📱 Bunker URL:', bunkerUrl.substring(0, 30) + '...');

      // Generate client keypair for this session
      const clientSecretKey = generateSecretKey();
      const pool = new SimplePool();

      console.log('[BunkerConnect] 🔑 Generated client session keypair');

      // Connect using BunkerSigner - this is the key part from 0xchat patterns
      console.log('[BunkerConnect] 📡 Creating BunkerSigner connection...');
      
      const signer = await BunkerSigner.fromURI(
        clientSecretKey,
        bunkerUrl,
        {
          pool,
          timeout: 60000  // 60 seconds for mobile reliability
        }
      );

      console.log('[BunkerConnect] ✅ BunkerSigner connected!');

      // Get the user's public key
      console.log('[BunkerConnect] 🔍 Getting user pubkey...');
      const userPubkey = await signer.getPublicKey();
      
      console.log('[BunkerConnect] 👤 Got user pubkey:', userPubkey);

      setStatus('success');

      // Convert Uint8Array to hex string for storage
      const clientSecretKeyHex = Array.from(clientSecretKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Return connection details
      onConnectSuccess({
        pubkey: userPubkey,
        clientSecretKey: clientSecretKeyHex,
        bunkerUri: bunkerUrl
      });

    } catch (error) {
      console.error('[BunkerConnect] ❌ Connection failed:', error);
      setStatus('error');
      
      let errorMsg = 'Failed to connect. ';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMsg += 'Connection timed out. Ensure your signing app is open and connected to the internet.';
        } else if (error.message.includes('relay')) {
          errorMsg += 'Could not connect to relay. Check your internet connection.';
        } else if (error.message.includes('secret')) {
          errorMsg += 'Invalid bunker URL or secret. Please generate a new one in your signing app.';
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
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Link className="h-5 w-5 text-purple-400" />
          <h3 className="text-white font-medium">Connect with Bunker URL</h3>
        </div>
        <p className="text-sm text-slate-400">
          Paste the bunker:// URL from your signing app
        </p>
      </div>

      {/* IDLE STATE - INPUT FORM */}
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
              <li>Open your signing app (Nsec.app, Alby, etc.)</li>
              <li>Look for "Create Connection" or "Bunker" option</li>
              <li>Generate a new bunker URL</li>
              <li>Copy the bunker:// URL that appears</li>
              <li>Paste it in the field above</li>
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

      {/* CONNECTING STATE */}
      {status === 'connecting' && (
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <div className="text-center">
            <p className="text-slate-300 mb-2">Connecting to signing app...</p>
            <p className="text-xs text-slate-400">This may take up to 60 seconds</p>
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
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <h3 className="text-white font-medium">Connection Failed</h3>
            <p className="text-slate-400 text-sm text-center max-w-md">{errorMessage}</p>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">
              <strong className="text-slate-300">Troubleshooting:</strong>
            </p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
              <li>Check that the bunker URL is correct and complete</li>
              <li>Ensure your signing app is open and connected</li>
              <li>Try generating a new bunker URL in your signing app</li>
              <li>Check your internet connection</li>
              <li>Make sure the bunker URL hasn't expired</li>
            </ul>
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
              onClick={() => {
                setStatus('idle');
                setErrorMessage('');
              }} 
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
