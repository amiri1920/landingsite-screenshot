const fs = require('fs');
const path = require('path');
const { captureScreenshot } = require('./landingsite-screenshot');

/**
 * Queue system for processing multiple screenshot requests
 */
class ScreenshotQueue {
    /**
     * Create a new screenshot queue
     * @param {number} concurrency - Number of concurrent screenshots
     * @param {number} retries - Number of retry attempts
     */
    constructor(concurrency = 1, retries = 3) {
        this.concurrency = concurrency;
        this.retries = retries;
        this.activeJobs = 0;
        this.batchStatuses = {};
    }
    
    /**
     * Process a batch of IDs
     * @param {string} batchId - Unique batch identifier
     * @param {Array<string>} ids - Array of website preview IDs
     */
    processBatch(batchId, ids) {
        // Initialize batch status
        this.batchStatuses[batchId] = {
            id: batchId,
            status: 'processing',
            total: ids.length,
            completed: 0,
            successful: 0,
            failed: 0,
            startTime: Date.now(),
            endTime: null,
            results: {
                success: [],
                failed: []
            }
        };
        
        // Create output directory if it doesn't exist
        const outputDir = './screenshots';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Create a queue of IDs to process
        const queue = [...ids];
        
        // Process function that handles concurrency
        const processNext = () => {
            if (queue.length === 0) {
                // If no more items in queue and no active jobs, we're done
                if (this.activeJobs === 0) {
                    const status = this.batchStatuses[batchId];
                    status.status = 'completed';
                    status.endTime = Date.now();
                    status.duration = status.endTime - status.startTime;
                    
                    console.log(`Batch ${batchId} completed: ${status.successful} successful, ${status.failed} failed`);
                }
                return;
            }
            
            // If we're at max concurrency, wait for a job to finish
            if (this.activeJobs >= this.concurrency) {
                return;
            }
            
            // Get the next ID from the queue
            const id = queue.shift();
            this.activeJobs++;
            
            // Process the ID
            this.processId(batchId, id, 0)
                .finally(() => {
                    this.activeJobs--;
                    // Process the next item
                    processNext();
                });
            
            // Try to process more items if we have capacity
            processNext();
        };
        
        // Start processing
        processNext();
    }
    
    /**
     * Process a single ID with retries
     * @param {string} batchId - Batch identifier
     * @param {string} id - Website preview ID
     * @param {number} attempt - Current attempt number
     */
    async processId(batchId, id, attempt) {
        const status = this.batchStatuses[batchId];
        const outputPath = path.join('./screenshots', `${id}.png`);
        
        try {
            console.log(`Processing ID: ${id} (Attempt ${attempt + 1}/${this.retries})`);
            
            const result = await captureScreenshot(id, outputPath);
            
            if (result.success) {
                // Success
                status.results.success.push({
                    id,
                    path: outputPath,
                    attempts: attempt + 1
                });
                status.successful++;
                status.completed++;
                console.log(`Successfully captured screenshot for ID: ${id}`);
            } else {
                // Failure, retry if we haven't reached max attempts
                if (attempt < this.retries - 1) {
                    console.log(`Retrying ID: ${id} (${this.retries - attempt - 1} attempts remaining)`);
                    return this.processId(batchId, id, attempt + 1);
                } else {
                    // Max retries reached, mark as failed
                    status.results.failed.push({
                        id,
                        error: result.error,
                        attempts: attempt + 1
                    });
                    status.failed++;
                    status.completed++;
                    console.error(`Failed to capture screenshot for ID: ${id} after ${attempt + 1} attempts`);
                }
            }
        } catch (error) {
            // Unexpected error, retry if we haven't reached max attempts
            if (attempt < this.retries - 1) {
                console.log(`Error processing ID: ${id}, retrying (${this.retries - attempt - 1} attempts remaining)`);
                return this.processId(batchId, id, attempt + 1);
            } else {
                // Max retries reached, mark as failed
                status.results.failed.push({
                    id,
                    error: error.message,
                    attempts: attempt + 1
                });
                status.failed++;
                status.completed++;
                console.error(`Failed to process ID: ${id} after ${attempt + 1} attempts: ${error.message}`);
            }
        }
    }
    
    /**
     * Get the status of a batch
     * @param {string} batchId - Batch identifier
     * @returns {Object|null} - Batch status or null if not found
     */
    static getBatchStatus(batchId) {
        return ScreenshotQueue.prototype.batchStatuses[batchId] || null;
    }
}

// Initialize static property to store batch statuses across instances
ScreenshotQueue.prototype.batchStatuses = {};

module.exports = { ScreenshotQueue };