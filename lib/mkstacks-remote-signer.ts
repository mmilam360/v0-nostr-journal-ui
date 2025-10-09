'use client';

import { SimplePool, nip04 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
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
  async listenForConnection(timeoutMs = 120000): Promise<{ signer: any; session: any }> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout. Please try again.'));
      }, timeoutMs);

      try {
        // Subscribe to NIP-46 requests
        const sub = this.pool.subscribeMany(
          this.relays,
          [{
            kinds: [24133], // NIP-46 request
            '#p': [this.appPublicKey]
          }],
          {
            onevent: async (event) => {
              try {
                // Decrypt the request
                const decrypted = await nip04.decrypt(this.appSecretKey, event.content);
                const request = JSON.parse(decrypted);

                if (request.method === 'connect') {
                  this.walletPubkey = event.pubkey;
                  this.sharedSecret = await nip04.getSharedSecret(this.appSecretKey, this.walletPubkey);
                  this.isConnected = true;

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

                  clearTimeout(timeout);
                  resolve({
                    signer: this,
                    session: {
                      walletPubkey: this.walletPubkey,
                      sharedSecret: this.sharedSecret,
                      relays: this.relays
                    }
                  });
                }
              } catch (error) {
                console.error('Error processing connection request:', error);
              }
            }
          }
        );

        // Clean up on timeout
        setTimeout(() => {
          sub.close();
        }, timeoutMs);

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  // Connect to remote signer (signer-initiated flow)
  async connectToRemote(bunkerUrl: string): Promise<{ signer: any; session: any }> {
    try {
      const url = new URL(bunkerUrl);
      const walletPubkey = url.hostname;
      const relayUrl = url.searchParams.get('relay');
      const secret = url.searchParams.get('secret');

      if (!relayUrl || !secret) {
        throw new Error('Invalid bunker URL format');
      }

      this.walletPubkey = walletPubkey;
      this.sharedSecret = await nip04.getSharedSecret(this.appSecretKey, walletPubkey);
      this.isConnected = true;

      return {
        signer: this,
        session: {
          walletPubkey: this.walletPubkey,
          sharedSecret: this.sharedSecret,
          relays: [relayUrl]
        }
      };
    } catch (error) {
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
