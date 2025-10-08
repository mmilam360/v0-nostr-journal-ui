/**
 * Batch Operations Manager
 * 
 * Handles batching multiple operations together to reduce the number of
 * remote signer permission requests and improve performance.
 */

export interface BatchOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  note?: any
  noteId?: string
  timestamp: number
}

export class BatchOperationsManager {
  private operations: BatchOperation[] = []
  private batchTimeout: NodeJS.Timeout | null = null
  private readonly BATCH_DELAY = 2000 // 2 seconds
  private readonly MAX_BATCH_SIZE = 10 // Maximum operations per batch

  constructor(
    private onBatchProcess: (operations: BatchOperation[]) => Promise<void>
  ) {}

  /**
   * Add an operation to the batch queue
   */
  addOperation(operation: Omit<BatchOperation, 'id' | 'timestamp'>) {
    const batchOperation: BatchOperation = {
      ...operation,
      id: `${operation.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }

    this.operations.push(batchOperation)
    console.log(`[BatchOps] Added ${operation.type} operation. Queue size: ${this.operations.length}`)

    // If we've hit the max batch size, process immediately
    if (this.operations.length >= this.MAX_BATCH_SIZE) {
      console.log(`[BatchOps] Max batch size reached, processing immediately`)
      this.processBatch()
      return
    }

    // Reset the timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }

    // Set new timeout
    this.batchTimeout = setTimeout(() => {
      this.processBatch()
    }, this.BATCH_DELAY)
  }

  /**
   * Process all queued operations
   */
  private async processBatch() {
    if (this.operations.length === 0) {
      return
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }

    const operationsToProcess = [...this.operations]
    this.operations = []

    console.log(`[BatchOps] Processing batch of ${operationsToProcess.length} operations`)

    try {
      await this.onBatchProcess(operationsToProcess)
      console.log(`[BatchOps] ✅ Batch processed successfully`)
    } catch (error) {
      console.error(`[BatchOps] ❌ Batch processing failed:`, error)
      // Re-queue failed operations (optional - could also show error to user)
      // this.operations.unshift(...operationsToProcess)
    }
  }

  /**
   * Force process all pending operations immediately
   */
  async flush() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
    await this.processBatch()
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      pendingOperations: this.operations.length,
      operations: [...this.operations]
    }
  }

  /**
   * Clear all pending operations
   */
  clear() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
    this.operations = []
  }
}

/**
 * Create a batch operations manager instance
 */
export function createBatchOperationsManager(
  onBatchProcess: (operations: BatchOperation[]) => Promise<void>
): BatchOperationsManager {
  return new BatchOperationsManager(onBatchProcess)
}
