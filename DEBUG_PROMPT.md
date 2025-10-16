# Lightning Goals Debug Prompt

## Current Issue
The Lightning Goals system is not automatically triggering rewards when users exceed their daily word goals. The autosave event should trigger the reward, but it's not working.

## System Architecture
- **LightningGoalsMonitor**: Always-active background component that should detect word count changes
- **LightningGoalsManager**: UI component for setup/tracking (only active when modal is open)
- **Main App**: Sets `lastSavedWordCount` state when notes are autosaved

## Expected Flow
1. User writes note → autosave triggers
2. `setLastSavedWordCount(wordCount)` called in main-app
3. LightningGoalsMonitor detects change via `currentWordCount` prop
4. Monitor checks if goal is exceeded
5. If yes, sends reward automatically

## Debugging Steps Needed

### 1. Check Word Count Flow
- Verify `setLastSavedWordCount(wordCount)` is being called in main-app
- Check if `lastSavedWordCount` state is being set correctly
- Confirm LightningGoalsMonitor is receiving `currentWordCount` prop

### 2. Check Monitor Activation
- Verify LightningGoalsMonitor is always rendered when user is authenticated
- Check if monitor's `useEffect` is triggering on word count changes
- Confirm monitor is loading stake data correctly

### 3. Check Goal Detection
- Verify `checkGoalCompletion()` function is being called
- Check if goal comparison logic is working
- Confirm reward sending API calls are succeeding

### 4. Check State Management
- Verify `hasMetGoalToday` state is working correctly
- Check if `isProcessing` state prevents duplicate processing
- Confirm daily reset logic works

## Key Files to Examine
- `components/main-app.tsx` - Word count setting and monitor integration
- `components/lightning-goals-monitor.tsx` - Background monitoring logic
- `components/lightning-goals-manager.tsx` - UI component
- `lib/incentive-nostr.ts` - Event system and API calls

## Console Logs to Look For
```
[LightningGoalsMonitor] 🔍 Word count updated: {wordCount}
[LightningGoalsMonitor] 🎯 Goal reached! Processing reward...
[LightningGoalsMonitor] ✅ Reward sent successfully
```

## Questions to Investigate
1. Is the LightningGoalsMonitor component actually being rendered?
2. Is the `currentWordCount` prop being passed correctly?
3. Is the `useEffect` in the monitor triggering when word count changes?
4. Is the stake data being loaded correctly in the monitor?
5. Are the API calls for reward sending working?
6. Is there an error in the goal comparison logic?

Please help debug this system to ensure autosave events properly trigger Lightning rewards when daily goals are exceeded.
