/**
 * Request deduplication to avoid duplicate fetches
 * Multiple components requesting same data? One request.
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  resolveCount: number;
}

class RequestDeduplicator {
  private pendingRequests = new Map<string, PendingRequest<any>>();
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired requests every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000);
    
    console.log('[RequestDeduplicator] Initialized');
  }

  async dedupe<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Check if request already in flight
    const existingRequest = this.pendingRequests.get(key);
    
    if (existingRequest) {
      // Check if request is still valid (not expired)
      if (Date.now() - existingRequest.timestamp < ttl) {
        existingRequest.resolveCount++;
        console.log(`[RequestDeduplicator] Using existing request: ${key} (${existingRequest.resolveCount} waiting)`);
        return existingRequest.promise;
      } else {
        // Request expired, remove it
        this.pendingRequests.delete(key);
        console.log(`[RequestDeduplicator] Request expired, creating new: ${key}`);
      }
    }

    // Create new request
    console.log(`[RequestDeduplicator] New request: ${key}`);
    
    const promise = fetchFn().finally(() => {
      // Clean up after completion
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
      resolveCount: 1
    });

    return promise;
  }

  private cleanupExpiredRequests() {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.DEFAULT_TTL) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      console.log(`[RequestDeduplicator] Cleaning up ${expiredKeys.length} expired requests`);
      expiredKeys.forEach(key => this.pendingRequests.delete(key));
    }
  }

  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      requests: Array.from(this.pendingRequests.entries()).map(([key, request]) => ({
        key: key.substring(0, 20) + '...',
        age: Date.now() - request.timestamp,
        waiting: request.resolveCount
      }))
    };
  }

  clear() {
    const clearedCount = this.pendingRequests.size;
    this.pendingRequests.clear();
    console.log(`[RequestDeduplicator] Cleared ${clearedCount} pending requests`);
  }

  // Shutdown cleanup
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    console.log('[RequestDeduplicator] Shutdown complete');
  }
}

// Singleton instance
export const requestDeduplicator = new RequestDeduplicator();

// Helper functions for easy integration
export const dedupeRequest = <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  return requestDeduplicator.dedupe(key, fetchFn, ttl);
};

export const getRequestDeduplicatorStats = () => {
  return requestDeduplicator.getStats();
};

export const clearRequestDeduplicator = () => {
  requestDeduplicator.clear();
};

export const shutdownRequestDeduplicator = () => {
  requestDeduplicator.shutdown();
};

// Specialized deduplication functions for common use cases
export const dedupeNoteFetch = (
  noteId: string,
  authData: any,
  fetchFn: () => Promise<any>
) => {
  const key = `note_${noteId}_${authData.pubkey}`;
  return dedupeRequest(key, fetchFn, 10000); // 10 second TTL for notes
};

export const dedupeRelayFetch = (
  relays: string[],
  filters: any[],
  fetchFn: () => Promise<any>
) => {
  const relayKey = relays.sort().join(',');
  const filterKey = JSON.stringify(filters);
  const key = `relay_${relayKey}_${filterKey}`;
  return dedupeRequest(key, fetchFn, 5000); // 5 second TTL for relay fetches
};

export const dedupeUserData = (
  pubkey: string,
  dataType: string,
  fetchFn: () => Promise<any>
) => {
  const key = `user_${pubkey}_${dataType}`;
  return dedupeRequest(key, fetchFn, 15000); // 15 second TTL for user data
};
