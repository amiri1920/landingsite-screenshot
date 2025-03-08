const express = require('express');
const path = require('path');
const fs = require('fs');
const { ScreenshotQueue } = require('./queue-processor');
const { captureScreenshot } = require('./landingsite-screenshot');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use('/screenshots', express.static('screenshots'));

// Add a simple error handler middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// Add request timeout middleware
const timeout = 300000; // 5 minutes
app.use((req, res, next) => {
    res.setTimeout(timeout, () => {
        console.error('Request timeout');
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                message: 'Request timeout',
                error: 'The request took too long to process'
            });
        }
    });
    next();
});

// Root endpoint for healthchecks
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Landingsite Screenshot Service' });
});

// Endpoint to capture a single screenshot
app.post('/api/screenshot', async (req, res) => {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'Missing ID parameter' });
    }
    
    console.log(`API request to capture screenshot for ID: ${id}`);
    
    // Create output directory if it doesn't exist
    const outputDir = './screenshots';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `${id}.png`);
    
    try {
        const result = await captureScreenshot(id, outputPath, req.body);
        
        if (result.success) {
            const screenshotUrl = `/screenshots/${id}.png`;
            res.json({
                success: true,
                message: 'Screenshot captured successfully',
                id,
                url: screenshotUrl,
                fullUrl: `${req.protocol}://${req.get('host')}${screenshotUrl}`
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to capture screenshot',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        res.status(500).json({
            success: false,
            message: 'Error capturing screenshot',
            error: error.message
        });
    }
});

// Endpoint optimized for n8n integration
app.post('/api/n8n/screenshot', async (req, res) => {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'Missing ID parameter' });
    }
    
    console.log(`n8n API request to capture screenshot for ID: ${id}`);
    
    // Create output directory if it doesn't exist
    const outputDir = './screenshots';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `${id}.png`);
    
    try {
        // Add memory usage logging
        const memoryUsage = process.memoryUsage();
        console.log(`Memory usage before screenshot - RSS: ${memoryUsage.rss / 1024 / 1024}MB, Heap: ${memoryUsage.heapUsed / 1024 / 1024}MB / ${memoryUsage.heapTotal / 1024 / 1024}MB`);
        
        const result = await captureScreenshot(id, outputPath, req.body);
        
        // Log memory usage after screenshot
        const afterMemoryUsage = process.memoryUsage();
        console.log(`Memory usage after screenshot - RSS: ${afterMemoryUsage.rss / 1024 / 1024}MB, Heap: ${afterMemoryUsage.heapUsed / 1024 / 1024}MB / ${afterMemoryUsage.heapTotal / 1024 / 1024}MB`);
        
        if (result.success) {
            const screenshotUrl = `/screenshots/${id}.png`;
            const fullUrl = `${req.protocol}://${req.get('host')}${screenshotUrl}`;
            
            // Format specifically for n8n
            res.json({
                id,
                screenshotUrl: fullUrl
            });
        } else {
            res.status(500).json({
                error: result.error || 'Failed to capture screenshot'
            });
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        res.status(500).json({
            error: error.message || 'Error capturing screenshot'
        });
    } finally {
        // Force garbage collection if available
        if (global.gc) {
            console.log('Running garbage collection');
            global.gc();
        }
    }
});

// Batch processing endpoint
app.post('/api/batch', async (req, res) => {
    const { ids, concurrency = 1, retries = 3 } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid IDs array' });
    }
    
    console.log(`API request to process batch of ${ids.length} IDs`);
    
    // Create a unique batch ID
    const batchId = Date.now().toString();
    
    // Initialize the queue
    const queue = new ScreenshotQueue(concurrency, retries);
    
    // Start processing in the background
    queue.processBatch(batchId, ids);
    
    // Return immediately with the batch ID
    res.json({
        success: true,
        message: 'Batch processing started',
        batchId,
        totalItems: ids.length,
        statusUrl: `/api/batch/${batchId}/status`
    });
});

// Batch status endpoint
app.get('/api/batch/:batchId/status', (req, res) => {
    const { batchId } = req.params;
    const status = ScreenshotQueue.getBatchStatus(batchId);
    
    if (!status) {
        return res.status(404).json({ error: 'Batch not found' });
    }
    
    res.json(status);
});

// Start the server with graceful shutdown
const server = app.listen(port, () => {
    console.log(`API server running on port ${port}`);
    console.log('- POST /api/screenshot - Capture a single screenshot');
    console.log('- POST /api/n8n/screenshot - Capture a screenshot (optimized for n8n)');
    console.log('- POST /api/batch - Process multiple IDs');
    console.log('- GET /api/batch/:batchId/status - Check batch status');
    
    // Log memory constraints
    console.log(`Memory limits - Node options: ${process.env.NODE_OPTIONS || 'none'}`);
    const memoryUsage = process.memoryUsage();
    console.log(`Initial memory usage - RSS: ${memoryUsage.rss / 1024 / 1024}MB, Heap: ${memoryUsage.heapUsed / 1024 / 1024}MB / ${memoryUsage.heapTotal / 1024 / 1024}MB`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});