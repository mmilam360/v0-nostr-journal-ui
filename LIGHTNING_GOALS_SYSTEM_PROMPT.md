# Lightning Goals System - Implementation Guide

## Overview
This is a Nostr-based Lightning Goals system that allows users to set daily writing goals and automatically receive Lightning rewards when they meet their targets. The system uses structured Nostr events to track stakes, progress, and payments.

## Architecture

### Core Components

1. **LightningGoalsMonitor** (`components/lightning-goals-monitor.tsx`)
   - Always active background component
   - Monitors word count changes from autosave events
   - Automatically triggers rewards when goals are exceeded
   - Prevents duplicate rewards with state management

2. **LightningGoalsManager** (`components/lightning-goals-manager.tsx`)
   - Main UI component for Lightning Goals
   - Handles setup, invoice, and tracking screens
   - Manages stake creation, payment verification, and cancellation

3. **IncentiveModal** (`components/incentive-modal.tsx`)
   - Modal wrapper for LightningGoalsManager
   - Only renders when modal is open

### Event System (`lib/incentive-nostr.ts`)

The system uses Nostr events with `kind: 30078` and specific `d` tags:

#### Event Types:
- **Stake Creation** (`d: "stake-creation"`): Records new stake setup
- **Balance Update** (`d: "balance-update"`): Records balance changes (rewards, deductions)
- **Daily Progress** (`d: "daily-progress"`): Records daily word count and goal status
- **Stake Cancellation** (`d: "stake-cancellation"`): Records stake cancellation with refund

#### Key Functions:
- `createStake()`: Creates new stake with payment verification
- `getCurrentStake()`: Reconstructs current stake from event history
- `updateStakeBalance()`: Records balance changes
- `recordDailyProgress()`: Records daily progress and goal completion
- `cancelStake()`: Cancels stake and records refund

### API Endpoints

1. **Create Deposit Invoice** (`/api/incentive/create-deposit-invoice`)
   - Creates Lightning invoice for stake payment
   - Uses NWC (Nostr Wallet Connect) for payment processing

2. **Verify Payment** (`/api/incentive/verify-payment`)
   - Verifies invoice payment status
   - Uses Alby SDK for payment verification

3. **Send Reward** (`/api/incentive/send-reward`)
   - Sends Lightning payments to users
   - Handles both rewards and refunds

## Current Issues & Workflow Problems

### 1. Autosave Reward Trigger Not Working
**Problem**: The LightningGoalsMonitor isn't detecting word count changes from autosave events.

**Current Flow**:
1. User writes note → autosave triggers
2. `setLastSavedWordCount(wordCount)` called in main-app
3. LightningGoalsMonitor should detect change and trigger reward
4. **ISSUE**: Monitor not receiving word count updates

**Debug Points**:
- Check if `lastSavedWordCount` state is being set correctly
- Verify LightningGoalsMonitor is receiving the prop
- Check if `useEffect` dependencies are correct
- Verify the monitor is always rendered when user is authenticated

### 2. Stake Fetching Performance
**Problem**: `getCurrentStake()` is slow because it queries all events without proper sorting.

**Current Implementation**:
```typescript
// Gets all creation events
const creationEvents = await pool.querySync(RELAYS, {
  kinds: [30078],
  authors: [userPubkey],
  "#d": ["stake-creation"]
})

// Sorts by creation time (most recent first)
creationEvents.sort((a, b) => b.created_at - a.created_at)
```

**Issues**:
- Still queries all events before sorting
- No limit on event queries
- Multiple relay queries can be slow

### 3. Progress Bar Updates
**Problem**: Progress bar doesn't update after goal completion.

**Current Flow**:
1. Goal reached → reward sent
2. `setHasMetGoalToday(true)` called
3. `setTodayProgress(wordCount)` called
4. **ISSUE**: UI not reflecting updated state

### 4. Event Query Optimization
**Problem**: Multiple event queries are inefficient.

**Current Queries**:
- Creation events for all stakes
- Cancellation events for all stakes  
- Balance update events for specific stake
- Daily progress events for specific stake

**Optimization Needed**:
- Single query with multiple event types
- Proper indexing and sorting
- Limit queries to recent events only

## Data Flow

### Stake Creation Flow:
1. User fills setup form → LightningGoalsManager
2. Generate invoice → API call
3. Payment verification → automatic checking
4. Create stake event → `createStake()`
5. Transition to tracking screen

### Goal Completion Flow:
1. Note autosave → `setLastSavedWordCount()`
2. LightningGoalsMonitor detects change
3. Check goal completion → `checkGoalCompletion()`
4. Send reward → API call
5. Update balance → `updateStakeBalance()`
6. Record progress → `recordDailyProgress()`

### State Management:
- `hasMetGoalToday`: Prevents duplicate rewards
- `isProcessing`: Prevents concurrent processing
- `stake`: Current active stake data
- `todayProgress`: Current day's word count
- `rewardSent`: Whether reward was sent today

## Technical Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Nostr**: nostr-tools, custom event handling
- **Lightning**: Alby SDK, NWC (Nostr Wallet Connect)
- **Storage**: Nostr relays (no local storage)
- **UI**: Tailwind CSS, Lucide icons

## Debugging Information

### Console Logs to Monitor:
```
[LightningGoalsMonitor] 🔍 Word count updated: {wordCount}
[LightningGoalsMonitor] 🎯 Goal reached! Processing reward...
[LightningGoalsMonitor] ✅ Reward sent successfully: {result}
[IncentiveNostr] ✅ Daily progress recorded: {wordCount} words
```

### Key State Variables:
- `lastSavedWordCount` in main-app
- `currentWordCount` in LightningGoalsMonitor
- `hasMetGoalToday` in LightningGoalsMonitor
- `stake` in LightningGoalsManager

## Improvement Suggestions

1. **Optimize Event Queries**:
   - Use single query with multiple event types
   - Add proper sorting and limiting
   - Cache frequently accessed data

2. **Improve State Management**:
   - Centralize state management
   - Better error handling and recovery
   - Proper loading states

3. **Enhanced Monitoring**:
   - Better logging and debugging
   - Real-time status updates
   - Error reporting and recovery

4. **Performance Optimization**:
   - Reduce API calls
   - Optimize event processing
   - Better caching strategies

## Current File Structure

```
components/
├── lightning-goals-manager.tsx     # Main UI component
├── lightning-goals-monitor.tsx     # Background monitor
├── incentive-modal.tsx            # Modal wrapper
└── main-app.tsx                   # Main app with monitor integration

lib/
└── incentive-nostr.ts            # Event system and Nostr functions

app/api/incentive/
├── create-deposit-invoice/       # Invoice creation
├── verify-payment/               # Payment verification
└── send-reward/                  # Reward sending
```

## Testing Checklist

- [ ] Autosave triggers word count update
- [ ] LightningGoalsMonitor receives word count changes
- [ ] Goal completion detection works
- [ ] Reward sending API calls succeed
- [ ] Progress bar updates after goal completion
- [ ] Stake fetching is fast and reliable
- [ ] Cancel stake functionality works
- [ ] Daily reset at midnight works
- [ ] Duplicate reward prevention works

This system should provide a seamless experience where users automatically receive Lightning rewards when they meet their daily writing goals, with proper state management and error handling throughout the process.
