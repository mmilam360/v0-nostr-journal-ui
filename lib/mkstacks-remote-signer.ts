'use client';

import { SimplePool, nip04 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { getSharedSecret } from 'nostr-tools/keys';
import { bytesToHex } from '@noble/hashes/utils';

// MKStacks-inspired remote signer implementation
export class MKStacksRemoteSigner {
  private pool: SimplePool;
  private relays: string[];
  private appSecretKey: Uint8Array;
  private appPublicKey: string;
  private walletPubkey?: string;
  private sharedSecret?: Uint8Array;
  private isConnected = false;

  constructor(relays: string[] = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ]) {
    this.pool = new SimplePool();
    this.relays = relays;
    this.appSecretKey = generateSecretKey();
    this.appPublicKey = getPublicKey(this.appSecretKey);
  }

  // Generate connection URI for client-initiated flow
  generateConnectionUri(): string {
    const metadata = {
      name: 'Nostr Journal',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://nostrjournal.app',
      description: 'Private journaling on Nostr',
      icons: ['https://nostrjournal.app/favicon.ico']
    };

    const encodedMetadata = encodeURIComponent(JSON.stringify(metadata));
    const relay = this.relays[0]; // Use first relay for connection
    const secret = bytesToHex(this.appSecretKey);

    return `nostrconnect://${this.appPublicKey}?relay=${encodeURIComponent(relay)}&metadata=${encodedMetadata}&secret=${secret}`;
  }

  // Listen for incoming connections (client-initiated)
  async listenForConnection(timeoutMs = 60000): Promise<{ signer: any; session: any }> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sub?.close();
          reject(new Error('Connection timeout. Please make sure your signing app is connected and try again.'));
        }
      }, timeoutMs);

      let sub: any = null;

      try {
        // Subscribe to NIP-46 requests
        sub = this.pool.subscribeMany(
          this.relays,
          [{
            kinds: [24133], // NIP-46 request
            '#p': [this.appPublicKey]
          }],
          {
            onevent: async (event) => {
              if (resolved) return;
              
              try {
                console.log('[MKStacks] Received connection request from:', event.pubkey);
                
                // Decrypt the request
                const decrypted = await nip04.decrypt(this.appSecretKey, event.content);
                const request = JSON.parse(decrypted);

                console.log('[MKStacks] Decrypted request:', request);

                if (request.method === 'connect') {
                  this.walletPubkey = event.pubkey;
                  this.sharedSecret = getSharedSecret(this.appSecretKey, this.walletPubkey);
                  this.isConnected = true;

                  console.log('[MKStacks] Connection established with:', this.walletPubkey);

                  // Send response
                  const response = {
                    result_type: 'connect',
                    result: {
                      pubkey: this.appPublicKey,
                      metadata: JSON.parse(request.params.metadata)
                    }
                  };

                  const encryptedResponse = await nip04.encrypt(this.sharedSecret, JSON.stringify(response));
                  const responseEvent = {
                    kind: 24133,
                    content: encryptedResponse,
                    tags: [['p', this.walletPubkey]],
                    created_at: Math.floor(Date.now() / 1000),
                    pubkey: this.appPublicKey
                  };

                  await this.pool.publish(this.relays, responseEvent);
                  console.log('[MKStacks] Sent connection response');

                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    sub?.close();
                    resolve({
                      signer: this,
                      session: {
                        walletPubkey: this.walletPubkey,
                        sharedSecret: this.sharedSecret,
                        relays: this.relays
                      }
                    });
                  }
                }
              } catch (error) {
                console.error('[MKStacks] Error processing connection request:', error);
              }
            }
          }
        );

        console.log('[MKStacks] Listening for connections on relays:', this.relays);

      } catch (error) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          sub?.close();
          reject(error);
        }
      }
    });
  }

  // Connect to remote signer (signer-initiated flow)
  async connectToRemote(bunkerUrl: string): Promise<{ signer: any; session: any }> {
    try {
      console.log('[MKStacks] Connecting to bunker URL:', bunkerUrl);
      
      const url = new URL(bunkerUrl);
      const walletPubkey = url.hostname;
      const relayUrl = url.searchParams.get('relay');
      const secret = url.searchParams.get('secret');

      console.log('[MKStacks] Parsed bunker URL:', { walletPubkey, relayUrl, hasSecret: !!secret });

      if (!relayUrl || !secret) {
        throw new Error('Invalid bunker URL format - missing relay or secret parameters');
      }

      this.walletPubkey = walletPubkey;
      this.sharedSecret = getSharedSecret(this.appSecretKey, walletPubkey);
      this.isConnected = true;

      console.log('[MKStacks] Connected to remote signer:', this.walletPubkey);

      return {
        signer: this,
        session: {
          walletPubkey: this.walletPubkey,
          sharedSecret: this.sharedSecret,
          relays: [relayUrl]
        }
      };
    } catch (error) {
      console.error('[MKStacks] Bunker connection error:', error);
      throw new Error(`Failed to connect to remote signer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Sign an event
  async signEvent(unsignedEvent: any): Promise<any> {
    if (!this.isConnected || !this.walletPubkey || !this.sharedSecret) {
      throw new Error('Not connected to remote signer');
    }

    try {
      // Send signing request
      const request = {
        method: 'sign_event',
        params: {
          event: unsignedEvent
        }
      };

      const encryptedRequest = await nip04.encrypt(this.sharedSecret, JSON.stringify(request));
      const requestEvent = {
        kind: 24133,
        content: encryptedRequest,
        tags: [['p', this.walletPubkey]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: this.appPublicKey
      };

      // Wait for response
      const response = await new Promise((resolve, reject) => {
        const sub = this.pool.subscribeMany(
          this.relays,
          [{
            kinds: [24133],
            authors: [this.walletPubkey],
            '#p': [this.appPublicKey]
          }],
          {
            onevent: async (event) => {
              try {
                const decrypted = await nip04.decrypt(this.sharedSecret!, event.content);
                const response = JSON.parse(decrypted);
                sub.close();
                resolve(response);
              } catch (error) {
                // Ignore decryption errors
              }
            }
          }
        );

        // Publish request
        this.pool.publish(this.relays, requestEvent);

        // Timeout after 30 seconds
        setTimeout(() => {
          sub.close();
          reject(new Error('Signing request timeout'));
        }, 30000);
      });

      if ((response as any).result_type === 'sign_event') {
        return (response as any).result;
      } else {
        throw new Error((response as any).error?.message || 'Signing failed');
      }
    } catch (error) {
      throw new Error(`Failed to sign event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get public key
  async getPublicKey(): Promise<string> {
    if (!this.walletPubkey) {
      throw new Error('Not connected to remote signer');
    }
    return this.walletPubkey;
  }

  // Close connection
  close() {
    this.isConnected = false;
    this.walletPubkey = undefined;
    this.sharedSecret = undefined;
    this.pool.close(this.relays);
  }
}
