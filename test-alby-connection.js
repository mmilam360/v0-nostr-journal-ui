// Test script to verify Alby Hub connection
// Run with: node test-alby-connection.js

const { NostrWebLNProvider } = require('@getalby/sdk');

async function testConnection() {
  try {
    console.log('🔗 Testing Alby Hub connection...');
    
    // Replace with your actual connection string
    const connectionString = 'nostr+walletconnect://3f4507eae61f124d149f03af9694872c7ac465338c1b91c876765daa23db32df?relay=wss://relay.getalby.com/v1&secret=0ead00bf77911f39274b5c3e0f0ea43810d130228866523bd699cb45d62f4b5d&lud16=michaelmilam@getalby.com';
    
    if (connectionString.includes('YOUR_ALBY_HUB_CONNECTION_STRING_HERE')) {
      console.log('❌ Please replace YOUR_ALBY_HUB_CONNECTION_STRING_HERE with your actual connection string');
      return;
    }
    
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: connectionString
    });
    
    console.log('📡 Connecting to Alby Hub...');
    await nwc.enable();
    
    console.log('✅ Connected successfully!');
    
    // Get node info
    const info = await nwc.getInfo();
    console.log('📊 Node Info:');
    console.log('  - Alias:', info.alias || 'Unknown');
    console.log('  - Balance:', info.balance ? `${info.balance} msats` : 'Unknown');
    
    // Test creating a small invoice
    console.log('🧾 Testing invoice creation...');
    const invoice = await nwc.makeInvoice({
      amount: 100, // 100 sats
      memo: 'Test invoice for Nostr Journal'
    });
    
    console.log('✅ Invoice created successfully!');
    console.log('  - Payment Request:', invoice.paymentRequest);
    console.log('  - Payment Hash:', invoice.paymentHash);
    
    console.log('\n🎉 Alby Hub connection test successful!');
    console.log('You can now use this connection string in your .env.local file');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure your connection string is correct');
    console.log('2. Check that your Alby Hub has the required permissions');
    console.log('3. Verify your Alby Hub is online and accessible');
  }
}

testConnection();
