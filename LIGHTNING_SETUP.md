# Lightning Incentive System Setup

## Overview

The Lightning incentive system allows users to stake sats and earn rewards for meeting their daily journaling goals. It requires a **Nostr Wallet Connect (NWC)** connection to create invoices and send payments.

## ⚠️ Required: NWC Configuration

The system needs a server-side NWC connection URL to:
- Create Lightning invoices when users deposit sats
- Send Lightning payments when users earn rewards
- Check payment status

### Step 1: Get Your NWC Connection URL

**Option A: Alby Hub (Recommended)**

1. Go to [getalby.com](https://getalby.com)
2. Sign in to your Alby account
3. Navigate to: **Connections → Apps → Connect a new app**
4. Create a new app connection
5. **Enable ALL permissions:**
   - `make_invoice` - Create invoices for deposits
   - `lookup_invoice` - Check if invoices are paid
   - `send_payment` - Send reward payments
   - `get_balance` - Check wallet balance
   - `get_info` - Get wallet info
6. Copy the connection URL (looks like: `nostr+walletconnect://pubkey?relay=wss://relay.getalby.com/v1&secret=secret`)

**Option B: Other NWC-Compatible Wallets**

Any wallet that supports NWC will work:
- Mutiny Wallet
- Cashu wallets with NWC
- Self-hosted NWC servers

### Step 2: Configure Cloudflare Pages

1. Go to your Cloudflare Pages dashboard
2. Select your **nostr-journal** project
3. Go to **Settings → Environment Variables**
4. Add a new variable:
   - **Name:** `NWC_CONNECTION_URL`
   - **Value:** Your NWC connection string from Step 1
   - **Environment:** Production (and Preview if needed)
5. Save changes
6. **Redeploy** your site for changes to take effect

### Step 3: Verify Setup

1. Open your app
2. Log in with any method (remote signer, extension, or nsec)
3. Go to the **Goals** section
4. Try to create a new stake
5. You should see a Lightning invoice QR code
6. If it works, you're all set! 🎉

## How It Works

### Deposit Flow

```
User → Creates stake → API generates invoice → User pays → Invoice verified → Stake activated
```

1. User sets daily word goal and reward amount
2. User clicks "Create Stake" with deposit amount
3. **Server** creates Lightning invoice via NWC
4. User scans QR code and pays invoice
5. **Server** verifies payment via NWC
6. Stake is activated, tracking begins

### Payout Flow

```
User meets goal → API sends payment → User receives sats
```

1. User writes enough words to meet daily goal
2. System detects goal completion
3. **Server** sends Lightning payment to user's address via NWC
4. User receives sats automatically
5. Balance is updated, streak continues

## Security Considerations

### NWC Connection URL Security

⚠️ **CRITICAL:** Keep your NWC connection URL secret!

- ✅ **DO:** Store in Cloudflare environment variables
- ✅ **DO:** Use a dedicated wallet for this app
- ✅ **DO:** Monitor wallet balance regularly
- ❌ **DON'T:** Commit to git
- ❌ **DON'T:** Share publicly
- ❌ **DON'T:** Use your main Lightning wallet

### Recommended Wallet Setup

1. Create a separate Alby account just for this app
2. Fund it with a reasonable amount (e.g., 50,000 - 100,000 sats)
3. Enable balance notifications
4. Monitor for suspicious activity
5. Rotate NWC connection periodically

## Troubleshooting

### Error: "NWC_CONNECTION_URL missing"

**Solution:** Follow Step 2 above to configure the environment variable in Cloudflare.

### Error: "Failed to create invoice"

**Possible causes:**
- NWC connection URL is invalid
- Wallet is offline
- Insufficient balance in wallet
- Incorrect permissions on NWC connection

**Solutions:**
1. Verify NWC URL is correct
2. Check wallet is online and accessible
3. Ensure wallet has sufficient balance
4. Regenerate NWC connection with all permissions

### Invoice created but not detecting payment

**Possible causes:**
- Payment verification endpoint not working
- NWC doesn't have `lookup_invoice` permission
- Network connectivity issues

**Solutions:**
1. Check NWC has `lookup_invoice` permission
2. Verify payment was actually sent
3. Check Cloudflare Functions logs
4. Wait a few minutes and try refreshing

### Rewards not being sent

**Possible causes:**
- User hasn't set Lightning address
- Insufficient wallet balance
- NWC doesn't have `send_payment` permission
- Invalid Lightning address

**Solutions:**
1. Verify user has set valid Lightning address
2. Check server wallet has sufficient balance
3. Ensure NWC has `send_payment` permission
4. Test Lightning address with another wallet first

## Architecture

### Components

```
┌─────────────────────────────────────────────┐
│           Client (Browser)                   │
│  - Lightning Goals UI                        │
│  - QR Code Display                          │
│  - Payment Status Checking                  │
└──────────────┬──────────────────────────────┘
               │
               │ HTTPS
               │
┌──────────────▼──────────────────────────────┐
│      Cloudflare Functions (API)              │
│  - create-deposit-invoice.ts                 │
│  - verify-payment.ts                         │
│  - send-reward.ts                           │
└──────────────┬──────────────────────────────┘
               │
               │ NWC (Nostr Wallet Connect)
               │
┌──────────────▼──────────────────────────────┐
│        Lightning Wallet (Alby)               │
│  - Invoice Generation                        │
│  - Payment Detection                         │
│  - Sending Payments                         │
└──────────────────────────────────────────────┘
```

### API Endpoints

- **`POST /api/incentive/create-deposit-invoice`**
  - Creates Lightning invoice for stake deposit
  - Returns: invoice string, payment hash

- **`POST /api/incentive/verify-payment`**
  - Checks if invoice has been paid
  - Returns: payment status (paid/unpaid)

- **`POST /api/incentive/send-reward`**
  - Sends Lightning payment to user
  - Returns: payment receipt

## Development vs Production

### Development (Local)

For local development, you can:
1. Use mock invoices (already implemented in Next.js API routes)
2. Set up Alby sandbox account
3. Use testnet Lightning

### Production (Cloudflare Pages)

For production:
1. **MUST** configure real NWC connection
2. **MUST** use real Lightning wallet with real sats
3. **MUST** monitor wallet balance
4. **MUST** implement proper error handling

## Cost Estimation

### Per User Per Month

Assuming:
- Average user creates 1 stake/month (500 sats deposit)
- Average user earns rewards 20 days/month (50 sats/day = 1000 sats/month)
- 10% of deposits are forfeited (user doesn't meet goal)

**Revenue:**
- Forfeited deposits: 50 sats/user/month

**Costs:**
- Lightning fees: ~1 sat per transaction
- Transactions per user: 2 (deposit + payout) = 2 sats/month

**Net:** ~48 sats/user/month profit from forfeitures (sustains system)

### Scaling Considerations

- With 100 users: Need ~50,000 sats in wallet
- With 1,000 users: Need ~500,000 sats in wallet
- Monitor and refill as needed

## Next Steps

1. ✅ Complete Step 1-3 above to configure NWC
2. ✅ Test with a small stake first
3. ✅ Monitor Cloudflare Functions logs
4. ✅ Set up balance monitoring
5. ✅ Enjoy your Lightning-powered journaling incentives! ⚡

## Support

If you encounter issues:
1. Check Cloudflare Functions logs
2. Verify NWC connection in Alby
3. Test invoice creation manually
4. Review this document
5. Open an issue on GitHub with error details
