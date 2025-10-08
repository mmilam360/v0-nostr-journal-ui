'use client';

import React, { useState, useEffect } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { nip04 } from 'nostr-tools';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle, AlertTriangle, Copy, ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RemoteSignerConnectProps {
  onSuccess: (result: { 
    pubkey: string; 
    clientSecretKey: string;
    bunkerUri: string;
  }) => void;
  onBack: () => void;
}

export default function RemoteSignerConnect({ onSuccess, onBack }: RemoteSignerConnectProps) {
  const [status, setStatus] = useState<'generating' | 'awaiting' | 'success' | 'error'>('generating');
  const [connectUri, setConnectUri] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [copied, setCopied] = useState(false);

  const RELAY = 'wss://relay.nostr.band'; // Simple, reliable relay

  useEffect(() => {
    initializeConnection();
    
    return () => {
      // Cleanup
      if (pool) {
        pool.close([RELAY]);
      }
    };
  }, []);

  const initializeConnection = async () => {
    try {
      console.log('[RemoteConnect] 🔌 Initializing connection...');
      
      // Generate app keypair
      const appSecretKey = generateSecretKey();
      const appPublicKey = getPublicKey(appSecretKey);
      
      console.log('[RemoteConnect] 🔑 App pubkey:', appPublicKey);
      
      // Create SimplePool
      const newPool = new SimplePool();
      setPool(newPool);
      
      // Generate secret for the connection
      const secret = Math.random().toString(36).substring(2, 15);
      
      // Create the nostrconnect:// URI exactly like nostrudel/flotilla
      const connectUri = `nostrconnect://${appPublicKey}?secret=${secret}&name=${encodeURIComponent('Nostr Journal')}&url=${encodeURIComponent('https://nostrjournal.app')}&relay=${encodeURIComponent(RELAY)}`;
      
      setConnectUri(connectUri);
      setStatus('awaiting');
      
      console.log('[RemoteConnect] 📱 Connect URI:', connectUri);
      
      // Listen for incoming connection events
      const sub = newPool.subscribe(
        [RELAY],
        [
          {
            kinds: [24133], // NIP-46 events
            '#p': [appPublicKey],
            since: Math.floor(Date.now() / 1000) - 10 // Last 10 seconds
          }
        ],
        {
          onevent: async (event) => {
            console.log('[RemoteConnect] 📨 Received event:', event);
            
            try {
              // Find the author (user's pubkey)
              const pTag = event.tags.find(tag => tag[0] === 'p');
              if (!pTag) {
                console.log('[RemoteConnect] ⚠️ No p tag found');
                return;
              }
              
              const userPubkey = pTag[1];
              console.log('[RemoteConnect] 👤 User pubkey:', userPubkey);
              
              // Decrypt the response
              const sharedSecret = nip04.getSharedSecret(appSecretKey, userPubkey);
              const decryptedContent = await nip04.decrypt(sharedSecret, event.content);
              const response = JSON.parse(decryptedContent);
              
              console.log('[RemoteConnect] 🔓 Decrypted response:', response);
              
              if (response.result && response.result === 'ack') {
                // Connection successful!
                console.log('[RemoteConnect] ✅ Connection approved!');
                
                setStatus('success');
                
                // Convert Uint8Array to hex string
                const clientSecretKeyHex = Array.from(appSecretKey)
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');
                
                // Call success callback
                onSuccess({
                  pubkey: userPubkey,
                  clientSecretKey: clientSecretKeyHex,
                  bunkerUri: connectUri
                });
              }
            } catch (error) {
              console.error('[RemoteConnect] ❌ Error processing event:', error);
            }
          },
          oneose: () => {
            console.log('[RemoteConnect] 📭 End of stored events');
          }
        }
      );
      
      // Set timeout for connection
      setTimeout(() => {
        if (status === 'awaiting') {
          setStatus('error');
          setErrorMessage('Connection timed out. Please try again.');
        }
      }, 60000); // 60 second timeout
      
    } catch (error) {
      console.error('[RemoteConnect] ❌ Initialization failed:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize connection');
    }
  };

  const handleOpenInApp = () => {
    if (connectUri) {
      window.open(connectUri, '_blank');
    }
  };

  const handleCopyLink = async () => {
    if (connectUri) {
      try {
        await navigator.clipboard.writeText(connectUri);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">Connect with Signing App</h3>
      </div>

      {/* GENERATING STATE */}
      {status === 'generating' && (
        <div className="flex flex-col items-center justify-center space-y-3 py-6">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm text-muted-foreground">Generating secure connection...</p>
        </div>
      )}

      {/* AWAITING STATE */}
      {status === 'awaiting' && (
        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="w-40 h-40 sm:w-48 sm:h-48 bg-white rounded-lg flex items-center justify-center p-2 sm:p-3">
              <QRCodeSVG 
                value={connectUri} 
                size={150} 
                level="M"
                includeMargin={true}
              />
            </div>
          </div>

          {/* Connection Link */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-xs text-muted-foreground font-medium">Connection Link:</label>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyLink}
                className="h-6 px-2 text-xs"
              >
                {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <code className="text-xs text-muted-foreground font-mono break-all bg-background p-2 rounded block">
              {connectUri}
            </code>
          </div>

          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-2 font-medium">
              How to connect:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open your signing app (Nsec.app, Alby, etc.)</li>
              <li>Look for "Connect" or "Scan QR" option</li>
              <li>Scan the QR code or paste the link above</li>
              <li>Approve the connection in your app</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              onClick={handleOpenInApp}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Signing App
            </Button>
            
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="w-full text-sm py-2"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Connection Link
            </Button>
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center justify-center space-x-2 text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Waiting for approval...</span>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {status === 'success' && (
        <div className="flex flex-col items-center space-y-3 py-6">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <div className="text-center">
            <h3 className="font-medium">Connected!</h3>
            <p className="text-sm text-muted-foreground">Your signing app is now connected</p>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {status === 'error' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <h3 className="font-medium">Connection Failed</h3>
            <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-2 font-medium">
              Troubleshooting:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Make sure your signing app is open and connected</li>
              <li>Check your internet connection</li>
              <li>Try refreshing and scanning again</li>
              <li>Ensure your signing app supports nostrconnect://</li>
            </ul>
          </div>

          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              onClick={onBack} 
              className="flex-1"
            >
              Go Back
            </Button>
            <Button 
              onClick={initializeConnection}
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
