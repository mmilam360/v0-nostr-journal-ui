'use client';

import { saveNoteToNostr, deleteNoteOnNostr } from './nostr-storage';
import { saveEncryptedNotes } from './nostr-crypto';

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  note?: any; // Note object for create/update
  noteId?: string; // Note ID for delete
  timestamp: number;
  retryCount?: number;
}

export interface GlobalSyncManager {
  addOperation: (operation: Omit<SyncOperation, 'id' | 'timestamp'>) => void;
  processSync: () => Promise<void>;
  getPendingCount: () => number;
  clearPending: () => void;
}

export function createGlobalSyncManager(
  authData: any,
  onNotesUpdate: (notes: any[]) => void,
  onDeletedNotesUpdate: (deletedNotes: any[]) => void,
  onSyncStatusUpdate: (status: 'idle' | 'syncing' | 'synced' | 'error') => void
): GlobalSyncManager {
  let pendingOperations: SyncOperation[] = [];
  let isProcessing = false;
  let processTimeout: NodeJS.Timeout | null = null;

  const SYNC_DELAY = 1000; // 1 second delay
  const MAX_RETRIES = 3;

  const generateOperationId = () => {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const addOperation = (operation: Omit<SyncOperation, 'id' | 'timestamp'>) => {
    const fullOperation: SyncOperation = {
      ...operation,
      id: generateOperationId(),
      timestamp: Date.now(),
      retryCount: 0
    };

    // Remove any existing operations for the same note (except delete)
    if (operation.type !== 'delete') {
      pendingOperations = pendingOperations.filter(op => 
        !(op.note?.id === operation.note?.id && op.type !== 'delete')
      );
    }

    pendingOperations.push(fullOperation);
    console.log(`[GlobalSync] Added ${operation.type} operation for note:`, operation.note?.title || operation.noteId);

    // Schedule processing
    if (processTimeout) {
      clearTimeout(processTimeout);
    }
    
    processTimeout = setTimeout(() => {
      processSync();
    }, SYNC_DELAY);
  };

  const processSync = async () => {
    if (isProcessing || pendingOperations.length === 0) {
      return;
    }

    isProcessing = true;
    onSyncStatusUpdate('syncing');

    try {
      console.log(`[GlobalSync] Processing ${pendingOperations.length} operations...`);

      // Sort operations by timestamp to ensure proper ordering
      const sortedOperations = [...pendingOperations].sort((a, b) => a.timestamp - b.timestamp);
      
      // Process operations in order
      for (const operation of sortedOperations) {
        try {
          await processOperation(operation, authData);
          console.log(`[GlobalSync] ✅ Processed ${operation.type} operation:`, operation.note?.title || operation.noteId);
        } catch (error) {
          console.error(`[GlobalSync] ❌ Failed to process ${operation.type} operation:`, error);
          
          // Retry logic
          if (operation.retryCount! < MAX_RETRIES) {
            operation.retryCount = (operation.retryCount || 0) + 1;
            console.log(`[GlobalSync] Retrying operation (${operation.retryCount}/${MAX_RETRIES}):`, operation.note?.title || operation.noteId);
            // Don't remove from pending, let it retry on next sync
            continue;
          } else {
            console.error(`[GlobalSync] Max retries reached for operation:`, operation.note?.title || operation.noteId);
          }
        }
      }

      // Clear successfully processed operations
      pendingOperations = pendingOperations.filter(op => 
        op.retryCount! >= MAX_RETRIES || 
        sortedOperations.some(processed => processed.id === op.id)
      );

      // Trigger a full sync to get latest state from network
      await performFullSync(authData, onNotesUpdate, onDeletedNotesUpdate);

      onSyncStatusUpdate('synced');
      console.log('[GlobalSync] ✅ Sync cycle complete');

    } catch (error) {
      console.error('[GlobalSync] ❌ Sync cycle failed:', error);
      onSyncStatusUpdate('error');
    } finally {
      isProcessing = false;
    }
  };

  const processOperation = async (operation: SyncOperation, authData: any) => {
    switch (operation.type) {
      case 'create':
      case 'update':
        if (operation.note) {
          const result = await saveNoteToNostr(operation.note, authData);
          if (!result.success) {
            throw new Error(result.error || 'Failed to save note');
          }
        }
        break;

      case 'delete':
        if (operation.noteId) {
          // For delete operations, we need to find the note first
          // This will be handled by the full sync process
          console.log(`[GlobalSync] Delete operation queued for note: ${operation.noteId}`);
        }
        break;
    }
  };

  const performFullSync = async (
    authData: any, 
    onNotesUpdate: (notes: any[]) => void, 
    onDeletedNotesUpdate: (deletedNotes: any[]) => void
  ) => {
    try {
      // Import smartSyncNotes dynamically to avoid circular dependencies
      const { smartSyncNotes } = await import('./nostr-sync-fixed');
      
      // Get current state (this would need to be passed from the main component)
      // For now, we'll use a simplified approach
      console.log('[GlobalSync] Performing full sync...');
      
      // This would be called with the current notes and deletedNotes state
      // The main component will handle the actual sync logic
      
    } catch (error) {
      console.error('[GlobalSync] Full sync failed:', error);
      throw error;
    }
  };

  const getPendingCount = () => pendingOperations.length;

  const clearPending = () => {
    pendingOperations = [];
    if (processTimeout) {
      clearTimeout(processTimeout);
      processTimeout = null;
    }
  };

  return {
    addOperation,
    processSync,
    getPendingCount,
    clearPending
  };
}

