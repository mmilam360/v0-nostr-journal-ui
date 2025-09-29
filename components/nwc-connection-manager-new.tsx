The
Definitive, All - Inclusive
Prompt
for v0.ai
: A Fully Functional NWC QR Scanner

Project Goal:\
Generate a single, complete, and fully functional React component named <NwcConnectionManager />. This component must manage the entire Nostr Wallet Connect (NWC) flow, from displaying a QR code scanner to successfully handling the complex, real-time cryptographic handshake
with a wallet
like
Alby
Hub.It
must
be
self - contained, production - ready, and
styled
with Tailwind CSS.
\
Critical Context
for AI
: Solving the "Connection Timeout" Error
The primary challenge this component solves is the "connection timeout" error. This occurs when an app successfully sends a connection request (kind: 24133 event) to the wallet's relay but fails to correctly subscribe to, receive, and decrypt the wallet's approval response event. The provided logical blueprint explicitly solves this by:
\
    Using a Promise-based approach
with a timeout (Promise.race)
to
handle
cases
where
the
user
doesn
't respond.
\
    Correctly subscribing to the response event
using the
right
filters (authors, #p tags).
\
    Implementing the NIP-04 decryption needed to read the wallet's encrypted approval message.
\
Core Documentation
for AI Reference
:
This implementation is based on established Nostr protocols and libraries. The core logic is derived from:
\
    Nostr Wallet Connect (NIP-46): The official protocol
for this entire handshake. (Reference: https://github.com/nostr-protocol/nips/blob/master/46.md)
\
    @nostr-connect/connect Library: The logic is modeled after Alby's official library for handling NWC connections, ensuring compatibility. (Reference: https://github.com/getAlby/nostr-connect)
\
    react-qr-reader Library: The camera access and QR code decoding functionality is handled by this reliable library. (Reference: https://www.npmjs.com/package/react-qr-reader)
\
    nostr-tools Library: Used for all cryptographic primitives like key generation and NIP-04 encryption, which are essential for the handshake. (Reference: https://github.com/nostr-protocol/nostr-tools)
\
Part 1: The Logical Blueprint (The Component's "Brain")
\
Instruction:\
This is the most critical part of the prompt. The following code block contains the complete, working logic for the entire component, including state management, cryptographic functions, and all necessary handlers. v0 must use this code as the foundation. The UI described in Part 2 should be perfectly wired to the states (status, errorMessage) and functions (reset, handleScanResult) defined in this blueprint.\
code JavaScript

    
// The complete, self-contained code for the component.\
'use client\';\
import React, { useState, useCallback } from \'react\';\
import { QrReader } from \'react-qr-reader\';\
import { generateSecretKey, getPublicKey, relayInit, nip04, finalizeEvent } from \'nostr-tools\';\
import { Loader2, CheckCircle, AlertTriangle, CameraOff, X } from \'lucide-react\';

// This is the core logic that powers the component.\
const useNwcConnection = ({ onConnectSuccess }) => {
  const [status, setStatus] = useState('scanning'); // 'scanning', 'connecting', 'success', 'error', 'permission_denied'
  const [errorMessage, setErrorMessage] = useState('');

  const connectWithUri = useCallback(async (nwcUri) => {
    setStatus('connecting');
    let relay; // Keep relay in a higher scope to close it in the finally block
    try {
      if (!nwcUri.startsWith('nostrconnect://')) throw new Error('Invalid QR Code. Please scan a Nostr Wallet Connect code.');

      // 1. Parse URI for wallet's pubkey and relay
      const url = new URL(nwcUri);
      const walletPubkey = url.hostname;
      const relayUrl = url.searchParams.get('relay');
      if (!walletPubkey || !relayUrl) throw new Error('Invalid NWC URI');

      // 2. Generate a temporary keypair for our app to communicate
      const appSecretKey = generateSecretKey();
      const appPublicKey = getPublicKey(appSecretKey);

      // 3. Connect to the wallet's specified relay
      relay = relayInit(relayUrl);
      await new Promise((resolve, reject) => {
        relay.on('connect', resolve);
        relay.on('error', reject);
        relay.connect().catch(reject);
        setTimeout(() => reject(new Error('Relay connection timed out')), 5000);
      });

      // 4. Create and encrypt the permission request (NIP-04)
      const connectPayload = { method: 'connect', params: [{ name: 'Nostr Journal' }] };
      const sharedSecret = nip04.getSharedSecret(appSecretKey, walletPubkey);
      const encryptedPayload = await nip04.encrypt(sharedSecret, JSON.stringify(connectPayload));
      const requestEvent = finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', walletPubkey]], content: encryptedPayload }, appSecretKey);

      // 5. Subscribe to the response AND create a promise that will resolve when the event is received
      const sub = relay.sub([{ kinds: [24133], authors: [walletPubkey], '#p': [appPublicKey] }]);
      const responsePromise = new Promise((resolve, reject) => {
        sub.on('event', async (event) => {
          try {
            const decrypted = await nip04.decrypt(sharedSecret, event.content);
            const response = JSON.parse(decrypted);
            if (response.result_type === 'connect') {
              const persistentConnectionString = `nostrconnect://${walletPubkey}?relay=${relayUrl}&secret=${Buffer.from(appSecretKey).toString('hex')}`;
              resolve({ pubkey: walletPubkey, connectionString: persistentConnectionString });
            } else {
              reject(new Error(response.error?.message || 'Connection rejected by wallet.'));
            }
          } catch (e) { /* Ignore decryption errors from unrelated events */ }
        });
      });
      
      // 6. Publish the request and race the response against a timeout
      await relay.publish(requestEvent);
      const result = await Promise.race([
        responsePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection request timed out. Please approve in your wallet.')), 60000))
      ]);

      // 7. If we get here, it was successful!
      setStatus('success');
      onConnectSuccess(result);

    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message);
      console.error(error);
    } finally {
      // 8. Clean up the connection
      if (relay) {
        relay.close();
      }
    }
  }, [onConnectSuccess]);
  
  const reset = useCallback(() => {
    setStatus('scanning');
    setErrorMessage('');
  }, []);

  return { status, errorMessage, setStatus, handleScanResult: connectWithUri, reset };
};

// This is the component that will be exported.
export function NwcConnectionManager({ onConnectSuccess, onClose }) {
  const { status, errorMessage, setStatus, handleScanResult, reset } = useNwcConnection({ onConnectSuccess })

  const renderContent = () => {
    switch (status) {
      case "scanning":
        return (
          <div>
            <h2 className="text-xl font-bold text-center mb-4 text-white">Scan to Connect</h2>
            <div className="overflow-hidden rounded-lg bg-black">
              <QrReader
                onResult={(result) => {
                  if (result) {
                    handleScanResult(result.text)
                  }
                }}
                onError={(error) => {
                  if (error.name === "NotAllowedError" || error.name === "NotFoundError") {
                    setStatus("permission_denied")
                  }
                }}
                constraints={{ facingMode: "environment" }}
                ViewFinder={() => (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                    <div className="w-60 h-60 border-4 border-dashed border-white/50 rounded-2xl" />
                  </div>
                )}
                className="w-full"
              />
            </div>
          </div>
        )
      case "permission_denied":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <CameraOff className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Camera Access Denied</h2>
            <p className="text-slate-400">Please enable camera permissions to continue.</p>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
            >
              Try Again
            </button>
          </div>
        )
      case "connecting":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <Loader2 className="h-16 w-16 animate-spin text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Connecting to Wallet...</h2>
            <p className="text-slate-400 text-center">Please approve the connection in your wallet app.</p>
          </div>
        )
      case "success":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64">
            <CheckCircle className="h-16 w-16 text-green-400" />
            <h2 className="text-xl font-bold text-white">Connection Successful!</h2>
          </div>
        )
      case "error":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 h-64 text-center">
            <AlertTriangle className="h-16 w-16 text-red-400" />
            <h2 className="text-xl font-bold text-white">Connection Failed</h2>
            <p className="text-slate-400 max-w-xs">{errorMessage}</p>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
            >
              Scan Again
            </button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg bg-slate-800 p-6 shadow-lg">
        {status !== "success" && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        )}
        {renderContent()}
      </div>
    </div>
  )
}

\
Part 2: Instructions on How to Use the Generated Component

Instruction:
Finally, provide the user
with a simple
example
of
how
to
use
this
self - contained
component in their
main
page.js
file.code
JavaScript

// In your src/app/page.js
;("use client")
import { useState } from "react"
// Assuming v0 places the generated component in 'src/components'
import { NwcConnectionManager } from "@/components/nwc-connection-manager"

export default function Home() {
  const [showNwcModal, setShowNwcModal] = useState(false)

  const handleConnectSuccess = (connectionData) => {
    console.log("SUCCESS! SAVE THIS DATA:", connectionData)
    // Here you would save connectionData.connectionString to localStorage
    // and set the user's pubkey in your app's main state.
    setTimeout(() => {
      setShowNwcModal(false)
      // Now you would show the unlock modal, for example.
    }, 1500) // Close modal after success animation
  }

  return (
    <main>
      {/* Your main login UI */}
      <button onClick={() => setShowNwcModal(true)}>Connect with Alby Hub (NWC)</button>

      {showNwcModal && (
        <NwcConnectionManager onConnectSuccess={handleConnectSuccess} onClose={() => setShowNwcModal(false)} />
      )}
    </main>
  )
}
