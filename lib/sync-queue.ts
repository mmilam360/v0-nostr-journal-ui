/**
 * Background sync queue for non-blocking UI operations
 * Like nostrudel - sync in background, never block UI
 */

interface SyncTask {
  id: string;
  type: 'save' | 'delete';
  note: any;
  authData: any;
  timestamp: number;
  retries: number;
  priority: 'high' | 'normal' | 'low';
}

interface SyncResult {
  success: boolean;
  taskId: string;
  error?: string;
  eventId?: string;
}

class SyncQueue {
  private queue: SyncTask[] = [];
  private processing = false;
  private maxRetries = 3;
  private processDelay = 100; // 100ms between tasks
  private processingTimeout: NodeJS.Timeout | null = null;
  private onTaskComplete?: (result: SyncResult) => void;
  private onTaskFailed?: (task: SyncTask, error: string) => void;
  private onQueueEmpty?: () => void;

  constructor() {
    console.log('[SyncQueue] Initialized');
  }

  // Event handlers
  onTaskCompleted(callback: (result: SyncResult) => void) {
    this.onTaskComplete = callback;
  }

  onTaskFailed(callback: (task: SyncTask, error: string) => void) {
    this.onTaskFailed = callback;
  }

  onQueueEmpty(callback: () => void) {
    this.onQueueEmpty = callback;
  }

  add(task: Omit<SyncTask, 'timestamp' | 'retries' | 'priority'>) {
    const fullTask: SyncTask = {
      ...task,
      timestamp: Date.now(),
      retries: 0,
      priority: 'normal'
    };

    // Insert based on priority (high first, then normal, then low)
    const insertIndex = this.queue.findIndex(t => t.priority === 'normal' || t.priority === 'low');
    if (insertIndex === -1) {
      this.queue.push(fullTask);
    } else {
      this.queue.splice(insertIndex, 0, fullTask);
    }

    console.log(`[SyncQueue] Added ${task.type} task for note ${task.id} (queue size: ${this.queue.length})`);
    
    // Start processing if not already
    if (!this.processing) {
      this.process();
    }
  }

  addHighPriority(task: Omit<SyncTask, 'timestamp' | 'retries' | 'priority'>) {
    const fullTask: SyncTask = {
      ...task,
      timestamp: Date.now(),
      retries: 0,
      priority: 'high'
    };

    // High priority tasks go to the front
    this.queue.unshift(fullTask);

    console.log(`[SyncQueue] Added HIGH PRIORITY ${task.type} task for note ${task.id} (queue size: ${this.queue.length})`);
    
    // Start processing immediately for high priority tasks
    if (!this.processing) {
      this.process();
    }
  }

  private async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      this.onQueueEmpty?.();
      console.log('[SyncQueue] Queue empty, stopping processing');
      return;
    }

    this.processing = true;
    const task = this.queue.shift()!;

    console.log(`[SyncQueue] Processing ${task.priority} priority ${task.type} task: ${task.id} (${task.retries}/${this.maxRetries} retries)`);

    try {
      let result: SyncResult;

      // Import dynamically to avoid circular dependencies
      if (task.type === 'save') {
        const { saveNoteToNostr } = await import('./nostr-storage');
        const saveResult = await saveNoteToNostr(task.note, task.authData);
        
        result = {
          success: saveResult.success,
          taskId: task.id,
          eventId: saveResult.eventId,
          error: saveResult.error
        };
      } else if (task.type === 'delete') {
        const { deleteNoteOnNostr } = await import('./nostr-storage');
        await deleteNoteOnNostr(task.note, task.authData);
        
        result = {
          success: true,
          taskId: task.id
        };
      } else {
        throw new Error(`Unknown task type: ${task.type}`);
      }

      if (result.success) {
        console.log(`[SyncQueue] ✅ Success: ${task.type} ${task.id}`);
        this.onTaskComplete?.(result);
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[SyncQueue] ❌ Failed: ${task.type} ${task.id}`, errorMessage);
      
      task.retries++;
      
      if (task.retries >= this.maxRetries) {
        console.error(`[SyncQueue] Max retries reached, giving up: ${task.id}`);
        this.onTaskFailed?.(task, errorMessage);
      } else {
        // Exponential backoff for retries
        const backoffDelay = Math.min(1000 * Math.pow(2, task.retries), 10000);
        console.log(`[SyncQueue] Retrying ${task.id} in ${backoffDelay}ms (attempt ${task.retries}/${this.maxRetries})`);
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queue.push(task);
          this.process();
        }, backoffDelay);
        
        // Process next task immediately
        setTimeout(() => this.process(), this.processDelay);
        return;
      }
    }

    // Process next task with small delay
    setTimeout(() => this.process(), this.processDelay);
  }

  // Get queue statistics
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      highPriority: this.queue.filter(t => t.priority === 'high').length,
      normalPriority: this.queue.filter(t => t.priority === 'normal').length,
      lowPriority: this.queue.filter(t => t.priority === 'low').length,
      retryTasks: this.queue.filter(t => t.retries > 0).length
    };
  }

  // Clear all pending tasks
  clear() {
    const clearedCount = this.queue.length;
    this.queue = [];
    console.log(`[SyncQueue] Cleared ${clearedCount} pending tasks`);
  }

  // Pause processing
  pause() {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    this.processing = false;
    console.log('[SyncQueue] Paused');
  }

  // Resume processing
  resume() {
    if (!this.processing && this.queue.length > 0) {
      console.log('[SyncQueue] Resumed');
      this.process();
    }
  }

  // Get tasks by type
  getTasksByType(type: 'save' | 'delete'): SyncTask[] {
    return this.queue.filter(task => task.type === type);
  }

  // Get tasks for a specific note
  getTasksForNote(noteId: string): SyncTask[] {
    return this.queue.filter(task => task.id === noteId);
  }

  // Remove tasks for a specific note (useful for cleanup)
  removeTasksForNote(noteId: string) {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(task => task.id !== noteId);
    const removedCount = initialLength - this.queue.length;
    
    if (removedCount > 0) {
      console.log(`[SyncQueue] Removed ${removedCount} tasks for note ${noteId}`);
    }
  }
}

// Singleton instance
export const syncQueue = new SyncQueue();

// Helper functions for easy integration
export const addSyncTask = (task: Omit<SyncTask, 'timestamp' | 'retries' | 'priority'>) => {
  syncQueue.add(task);
};

export const addHighPrioritySyncTask = (task: Omit<SyncTask, 'timestamp' | 'retries' | 'priority'>) => {
  syncQueue.addHighPriority(task);
};

export const getSyncQueueStats = () => {
  try {
    return syncQueue.getStats();
  } catch (error) {
    console.warn('[SyncQueue] Error getting stats:', error);
    return {
      queueLength: 0,
      processing: false,
      highPriority: 0,
      normalPriority: 0,
      lowPriority: 0,
      retryTasks: 0
    };
  }
};

export const clearSyncQueue = () => {
  syncQueue.clear();
};

export const pauseSyncQueue = () => {
  syncQueue.pause();
};

export const resumeSyncQueue = () => {
  syncQueue.resume();
};

export const removeSyncTasksForNote = (noteId: string) => {
  syncQueue.removeTasksForNote(noteId);
};

// Event handler helpers
export const onSyncTaskCompleted = (callback: (result: SyncResult) => void) => {
  syncQueue.onTaskCompleted(callback);
};

export const onSyncTaskFailed = (callback: (task: SyncTask, error: string) => void) => {
  syncQueue.onTaskFailed(callback);
};

export const onSyncQueueEmpty = (callback: () => void) => {
  syncQueue.onQueueEmpty(callback);
};
