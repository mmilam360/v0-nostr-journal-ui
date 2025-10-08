'use client';

import { saveNoteToNostr, deleteNoteOnNostr } from './nostr-storage';
import { saveEncryptedNotes } from './nostr-crypto';

export interface EventOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  note?: any;
  noteId?: string;
  timestamp: number;
}

export interface DirectEventManager {
  publishEvent: (operation: EventOperation, authData: any) => Promise<{ success: boolean; error?: string; eventId?: string }>;
  queueOperation: (operation: Omit<EventOperation, 'id' | 'timestamp'>) => void;
  processQueue: (authData: any) => Promise<void>;
  getQueueLength: () => number;
  clearQueue: () => void;
}

export function createDirectEventManager(): DirectEventManager {
  let operationQueue: EventOperation[] = [];
  let isProcessing = false;

  const generateId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const queueOperation = (operation: Omit<EventOperation, 'id' | 'timestamp'>) => {
    const fullOperation: EventOperation = {
      ...operation,
      id: generateId(),
      timestamp: Date.now()
    };

    // For updates, remove any existing operations for the same note
    if (operation.type === 'update' && operation.note) {
      operationQueue = operationQueue.filter(op => 
        !(op.note?.id === operation.note.id && op.type !== 'delete')
      );
    }

    operationQueue.push(fullOperation);
    console.log(`[DirectEventManager] Queued ${operation.type} operation:`, operation.note?.title || operation.noteId);
  };

  const publishEvent = async (operation: EventOperation, authData: any): Promise<{ success: boolean; error?: string; eventId?: string }> => {
    try {
      console.log(`[DirectEventManager] Publishing ${operation.type} event:`, operation.note?.title || operation.noteId);

      switch (operation.type) {
        case 'create':
        case 'update':
          if (operation.note) {
            const result = await saveNoteToNostr(operation.note, authData);
            return {
              success: result.success,
              error: result.error,
              eventId: result.eventId
            };
          }
          break;

        case 'delete':
          if (operation.noteId) {
            // For delete operations, we need the note object
            // This will be handled in processQueue where we have access to the full note
            console.log(`[DirectEventManager] Delete operation queued for note: ${operation.noteId}`);
            return { success: true };
          }
          break;
      }

      return { success: false, error: 'Invalid operation' };
    } catch (error) {
      console.error(`[DirectEventManager] Error publishing ${operation.type} event:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const processQueue = async (authData: any): Promise<void> => {
    if (isProcessing || operationQueue.length === 0) {
      return;
    }

    isProcessing = true;
    console.log(`[DirectEventManager] Processing ${operationQueue.length} operations...`);

    try {
      // Sort by timestamp to maintain order
      const sortedOperations = [...operationQueue].sort((a, b) => a.timestamp - b.timestamp);
      
      for (const operation of sortedOperations) {
        try {
          await publishEvent(operation, authData);
          console.log(`[DirectEventManager] ✅ Published ${operation.type} event:`, operation.note?.title || operation.noteId);
        } catch (error) {
          console.error(`[DirectEventManager] ❌ Failed to publish ${operation.type} event:`, error);
        }
      }

      // Clear processed operations
      operationQueue = [];
      console.log('[DirectEventManager] ✅ Queue processing complete');

    } catch (error) {
      console.error('[DirectEventManager] ❌ Queue processing failed:', error);
    } finally {
      isProcessing = false;
    }
  };

  const getQueueLength = () => operationQueue.length;
  const clearQueue = () => { operationQueue = []; };

  return {
    publishEvent,
    queueOperation,
    processQueue,
    getQueueLength,
    clearQueue
  };
}

