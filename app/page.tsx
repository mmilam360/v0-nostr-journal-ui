'use client';
import React, { useState } from 'react';
import { LoginPage } from '@/components/LoginPage'; // Adjust path if needed
import { MainApp } from '@/components/MainApp';   // Adjust path if needed

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  
  // ===================================================================================
  // THE CRITICAL NEW STATE: This will hold our connection to the remote wallet.
  // ===================================================================================
  const [remoteSigner, setRemoteSigner] = useState(null);

  // This function is the key. It gets called by LoginPage on success.
  const handleLoginSuccess = (data) => {
    // data now includes the `pubkey`, but also the `signer` object itself.
    setUserData({ pubkey: data.pubkey });
    
    // Create the remote signer object using the successful connection data.
    // This assumes your LoginPage now provides the full connection object.
    const signer = createRemoteSigner(data); // Hypothetical function
    setRemoteSigner(signer);
    
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setUserData(null);
    setRemoteSigner(null);
    setIsLoggedIn(false);
  };

  return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center">
      {isLoggedIn ? (
        // Pass the signer object down as a prop to the main app.
        <MainApp userData={userData} remoteSigner={remoteSigner} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </main>
  );
}

// NOTE FOR V0: You will need to define how the remoteSigner is created.
// For a bunker/NIP-46 login, it would be an object that knows how to
// construct and send encrypted `sign_event` requests back to the user's wallet.
