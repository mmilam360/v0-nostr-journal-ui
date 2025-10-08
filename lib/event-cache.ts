/**
 * In-memory event cache with LRU eviction
 * Based on how nostrudel.ninja caches events for maximum performance
 */

interface CachedEvent {
  event: any;
  timestamp: number;
  relay?: string;
  accessCount: number;
  lastAccessed: number;
}

class EventCache {
  private cache = new Map<string, CachedEvent>();
  private maxSize = 10000; // Keep last 10k events
  private ttl = 30 * 60 * 1000; // 30 minutes TTL
  private accessOrder: string[] = []; // Track access order for LRU

  set(eventId: string, event: any, relay?: string) {
    // LRU: Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(eventId, {
      event,
      timestamp: now,
      relay,
      accessCount: 1,
      lastAccessed: now
    });

    // Update access order
    this.updateAccessOrder(eventId);
    
    console.log(`[EventCache] Cached event ${eventId.substring(0, 8)} (${this.cache.size}/${this.maxSize})`);
  }

  get(eventId: string): any | null {
    const cached = this.cache.get(eventId);
    
    if (!cached) return null;
    
    // Check TTL
    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      this.cache.delete(eventId);
      this.removeFromAccessOrder(eventId);
      return null;
    }
    
    // Update access tracking
    cached.accessCount++;
    cached.lastAccessed = now;
    this.updateAccessOrder(eventId);
    
    return cached.event;
  }

  has(eventId: string): boolean {
    return this.get(eventId) !== null;
  }

  getMany(eventIds: string[]): Map<string, any> {
    const results = new Map();
    let hits = 0;
    
    for (const id of eventIds) {
      const event = this.get(id);
      if (event) {
        results.set(id, event);
        hits++;
      }
    }
    
    console.log(`[EventCache] Batch get: ${hits}/${eventIds.length} hits`);
    return results;
  }

  private evictLRU() {
    if (this.accessOrder.length === 0) return;
    
    // Remove least recently accessed item
    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
    
    console.log(`[EventCache] Evicted LRU: ${lruKey.substring(0, 8)}`);
  }

  private updateAccessOrder(eventId: string) {
    // Remove from current position
    this.removeFromAccessOrder(eventId);
    
    // Add to end (most recently accessed)
    this.accessOrder.push(eventId);
  }

  private removeFromAccessOrder(eventId: string) {
    const index = this.accessOrder.indexOf(eventId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
    console.log('[EventCache] Cache cleared');
  }

  size(): number {
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate(),
      oldestEvent: this.getOldestEvent(),
      newestEvent: this.getNewestEvent()
    };
  }

  private calculateHitRate(): number {
    let totalAccesses = 0;
    let totalEvents = 0;
    
    for (const cached of this.cache.values()) {
      totalAccesses += cached.accessCount;
      totalEvents++;
    }
    
    return totalEvents > 0 ? totalAccesses / totalEvents : 0;
  }

  private getOldestEvent(): string | null {
    let oldest: string | null = null;
    let oldestTime = Date.now();
    
    for (const [id, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTime) {
        oldestTime = cached.timestamp;
        oldest = id;
      }
    }
    
    return oldest;
  }

  private getNewestEvent(): string | null {
    let newest: string | null = null;
    let newestTime = 0;
    
    for (const [id, cached] of this.cache.entries()) {
      if (cached.timestamp > newestTime) {
        newestTime = cached.timestamp;
        newest = id;
      }
    }
    
    return newest;
  }
}

// Singleton instance
export const eventCache = new EventCache();

/**
 * Get from cache or fetch with automatic caching
 */
export async function getCachedOrFetch<T>(
  eventId: string,
  fetchFn: () => Promise<T>,
  options?: { ttl?: number }
): Promise<T> {
  // Check cache first
  const cached = eventCache.get(eventId);
  if (cached) {
    console.log(`[EventCache] HIT: ${eventId.substring(0, 8)}`);
    return cached as T;
  }

  // Cache miss - fetch
  console.log(`[EventCache] MISS: ${eventId.substring(0, 8)}`);
  const event = await fetchFn();
  
  if (event) {
    eventCache.set(eventId, event);
  }
  
  return event;
}

/**
 * Batch fetch with caching
 */
export async function getCachedOrFetchBatch<T>(
  eventIds: string[],
  fetchFn: (ids: string[]) => Promise<Map<string, T>>
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  const uncachedIds: string[] = [];
  
  // Check cache first
  const cached = eventCache.getMany(eventIds);
  cached.forEach((event, id) => {
    results.set(id, event as T);
  });
  
  // Find uncached IDs
  eventIds.forEach(id => {
    if (!results.has(id)) {
      uncachedIds.push(id);
    }
  });
  
  console.log(`[EventCache] Batch: ${cached.size} cached, ${uncachedIds.length} to fetch`);
  
  // Fetch uncached events
  if (uncachedIds.length > 0) {
    const fetched = await fetchFn(uncachedIds);
    
    // Cache and add to results
    fetched.forEach((event, id) => {
      eventCache.set(id, event);
      results.set(id, event);
    });
  }
  
  return results;
}

/**
 * Preload events into cache
 */
export async function preloadEvents(
  eventIds: string[],
  fetchFn: (ids: string[]) => Promise<Map<string, any>>
): Promise<void> {
  const uncachedIds = eventIds.filter(id => !eventCache.has(id));
  
  if (uncachedIds.length === 0) {
    console.log('[EventCache] All events already cached');
    return;
  }
  
  console.log(`[EventCache] Preloading ${uncachedIds.length} events`);
  const events = await fetchFn(uncachedIds);
  
  events.forEach((event, id) => {
    eventCache.set(id, event);
  });
  
  console.log(`[EventCache] Preloaded ${events.size} events`);
}
