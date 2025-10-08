/**
 * Persistent relay connection pool
 * Keeps WebSocket connections open like nostrudel.ninja for maximum performance
 */

import { SimplePool } from 'nostr-tools/pool';

interface RelayConnection {
  url: string;
  connected: boolean;
  lastUsed: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

class RelayPool {
  private pool: SimplePool | null = null;
  private connections = new Map<string, RelayConnection>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY = 10000; // 10 seconds (increased from 5s)
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 60 seconds (increased from 30s)
  private readonly MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5 to 3

  initialize(relays: string[]) {
    if (!this.pool) {
      this.pool = new SimplePool();
      console.log('[RelayPool] Initialized SimplePool');
    }

    // Initialize connection tracking for all relays
    relays.forEach(relay => {
      if (!this.connections.has(relay)) {
        this.connections.set(relay, {
          url: relay,
          connected: false,
          lastUsed: Date.now(),
          reconnectAttempts: 0,
          maxReconnectAttempts: this.MAX_RECONNECT_ATTEMPTS
        });
      }
    });

    // Start health check monitoring
    this.startHealthCheck();

    console.log(`[RelayPool] Initialized with ${relays.length} relays`);
  }

  private startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkConnections();
    }, this.HEALTH_CHECK_INTERVAL);

    console.log('[RelayPool] Health check started');
  }

  private async checkConnections() {
    const connections = Array.from(this.connections.values());
    const disconnected = connections.filter(conn => !conn.connected);
    
    if (disconnected.length > 0) {
      console.log(`[RelayPool] Found ${disconnected.length} disconnected relays, attempting reconnection`);
      disconnected.forEach(conn => {
        this.attemptReconnect(conn.url);
      });
    }
  }

  private attemptReconnect(relayUrl: string) {
    const connection = this.connections.get(relayUrl);
    if (!connection) return;

    if (connection.reconnectAttempts >= connection.maxReconnectAttempts) {
      console.log(`[RelayPool] Max reconnect attempts reached for ${relayUrl}`);
      return;
    }

    connection.reconnectAttempts++;
    console.log(`[RelayPool] Attempting reconnect ${connection.reconnectAttempts}/${connection.maxReconnectAttempts} to ${relayUrl}`);

    // Clear existing timer
    const existingTimer = this.reconnectTimers.get(relayUrl);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule reconnect attempt with longer delays to reduce network spam
    const delay = Math.min(this.RECONNECT_DELAY * Math.pow(2, connection.reconnectAttempts), 60000); // Max 60 seconds
    const timer = setTimeout(() => {
      this.forceReconnect(relayUrl);
    }, delay);

    this.reconnectTimers.set(relayUrl, timer);
  }

  private async forceReconnect(relayUrl: string) {
    try {
      console.log(`[RelayPool] Force reconnecting to ${relayUrl}`);
      
      // Force close existing connection if any
      if (this.pool) {
        this.pool.close([relayUrl]);
      }

      // Mark as attempting reconnection
      const connection = this.connections.get(relayUrl);
      if (connection) {
        connection.connected = false;
      }

      // SimplePool will automatically reconnect when we use it
      console.log(`[RelayPool] Reconnection initiated for ${relayUrl}`);
    } catch (error) {
      console.error(`[RelayPool] Error during reconnection to ${relayUrl}:`, error);
    }
  }

  getPool(): SimplePool {
    if (!this.pool) {
      throw new Error('RelayPool not initialized. Call initialize() first.');
    }
    return this.pool;
  }

  getConnectedRelays(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([url, _]) => url);
  }

  getAllRelays(): string[] {
    return Array.from(this.connections.keys());
  }

  async publish(event: any, relays?: string[]): Promise<void> {
    const pool = this.getPool();
    const targetRelays = relays || this.getAllRelays();
    
    console.log(`[RelayPool] Publishing to ${targetRelays.length} relays`);
    
    try {
      // Update last used time for all target relays
      targetRelays.forEach(relay => {
        const connection = this.connections.get(relay);
        if (connection) {
          connection.lastUsed = Date.now();
          connection.connected = true; // Assume connected if publish succeeds
        }
      });

      // Publish to all relays in parallel
      await Promise.any(pool.publish(targetRelays, event));
      console.log('[RelayPool] ✅ Publish successful');
    } catch (error) {
      console.error('[RelayPool] ❌ Publish failed:', error);
      
      // Mark failed relays as disconnected
      targetRelays.forEach(relay => {
        const connection = this.connections.get(relay);
        if (connection) {
          connection.connected = false;
        }
      });
      
      throw error;
    }
  }

  subscribe(
    filters: any[],
    relays?: string[],
    onEvent?: (event: any) => void,
    onEose?: () => void
  ) {
    const pool = this.getPool();
    const targetRelays = relays || this.getAllRelays();
    
    console.log(`[RelayPool] Subscribing to ${targetRelays.length} relays with ${filters.length} filters`);
    
    // Update last used time for all target relays
    targetRelays.forEach(relay => {
      const connection = this.connections.get(relay);
      if (connection) {
        connection.lastUsed = Date.now();
      }
    });

    const subscription = pool.subscribeMany(
      targetRelays,
      filters,
      {
        onevent: (event) => {
          // Mark relay as connected when we receive events
          const relayUrl = event.relay || targetRelays[0]; // Best guess
          const connection = this.connections.get(relayUrl);
          if (connection) {
            connection.connected = true;
            connection.reconnectAttempts = 0; // Reset on successful connection
          }
          
          onEvent?.(event);
        },
        oneose: () => {
          console.log('[RelayPool] Subscription EOSE received');
          onEose?.();
        },
        onclose: () => {
          console.log('[RelayPool] Subscription closed');
        }
      }
    );

    return subscription;
  }

  getConnectionStats() {
    const connections = Array.from(this.connections.values());
    return {
      total: connections.length,
      connected: connections.filter(c => c.connected).length,
      disconnected: connections.filter(c => !c.connected).length,
      connections: connections.map(c => ({
        url: c.url,
        connected: c.connected,
        lastUsed: new Date(c.lastUsed).toISOString(),
        reconnectAttempts: c.reconnectAttempts
      }))
    };
  }

  // Don't close connections on cleanup - keep them open for performance
  // Only call this on app unmount
  shutdown() {
    console.log('[RelayPool] Shutting down...');
    
    if (this.pool) {
      const allRelays = this.getAllRelays();
      this.pool.close(allRelays);
      this.pool = null;
    }
    
    this.connections.clear();
    
    // Clear all reconnect timers
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    
    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    console.log('[RelayPool] Shutdown complete');
  }

  // Force close connections to specific relays (for relay switching)
  closeRelays(relays: string[]) {
    if (this.pool) {
      this.pool.close(relays);
      relays.forEach(relay => {
        const connection = this.connections.get(relay);
        if (connection) {
          connection.connected = false;
        }
      });
      console.log(`[RelayPool] Closed connections to ${relays.length} relays`);
    }
  }
}

// Singleton instance
export const relayPool = new RelayPool();

// Helper functions for easy integration
export const initializeRelayPool = (relays: string[]) => {
  relayPool.initialize(relays);
};

export const getRelayPool = () => {
  return relayPool.getPool();
};

export const publishToRelays = async (event: any, relays?: string[]) => {
  return relayPool.publish(event, relays);
};

export const subscribeToRelays = (
  filters: any[],
  relays?: string[],
  onEvent?: (event: any) => void,
  onEose?: () => void
) => {
  return relayPool.subscribe(filters, relays, onEvent, onEose);
};

export const getRelayStats = () => {
  return relayPool.getConnectionStats();
};

export const shutdownRelayPool = () => {
  relayPool.shutdown();
};
