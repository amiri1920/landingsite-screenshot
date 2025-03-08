#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ScreenshotQueue } = require('./queue-processor');
const { captureScreenshot } = require('./landingsite-screenshot');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Help text
const helpText = `
Landingsite Screenshot Tool - Automated screenshot capture for landingsite.ai

Usage:
  node cli.js <command> [options]

Commands:
  capture <id>                 Capture a screenshot of a single website preview
  batch <file>                 Process multiple website preview IDs from a file
  help                         Show this help message

Options for 'capture':
  --output, -o <path>          Output file path (default: ./screenshot.png)
  --headless <true|false|new>  Run in headless mode (default: new)
  --timeout <ms>               Timeout in milliseconds (default: 300000)

Options for 'batch':
  --output-dir, -o <path>      Output directory (default: ./screenshots)
  --concurrency, -c <number>   Number of concurrent screenshots (default: 1)
  --retries, -r <number>       Number of retry attempts (default: 3)
  --headless <true|false|new>  Run in headless mode (default: new)
  --timeout <ms>               Timeout in milliseconds (default: 300000)

Examples:
  node cli.js capture 884975a2-5820-48d4-b415-0f038208bcbe -o ./my-screenshot.png
  node cli.js batch ids.txt -o ./batch-output -c 2
`;

// Helper function to parse options
function parseOptions(args, startIndex = 1) {
    const options = {};
    
    for (let i = startIndex; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--output' || arg === '-o') {
            options.output = args[++i];
        } else if (arg === '--output-dir' || arg === '-o') {
            options.outputDir = args[++i];
        } else if (arg === '--concurrency' || arg === '-c') {
            options.concurrency = parseInt(args[++i]);
        } else if (arg === '--retries' || arg === '-r') {
            options.retries = parseInt(args[++i]);
        } else if (arg === '--headless') {
            options.headless = args[++i];
            // Convert string to boolean if needed
            if (options.headless === 'true') options.headless = true;
            if (options.headless === 'false') options.headless = false;
        } else if (arg === '--timeout') {
            options.timeout = parseInt(args[++i]);
        }
    }
    
    return options;
}

// Handle commands
async function main() {
    if (!command || command === 'help') {
        console.log(helpText);
        return;
    }
    
    if (command === 'capture') {
        const id = args[1];
        if (!id) {
            console.error('Error: Missing website preview ID');
            console.log(helpText);
            process.exit(1);
        }
        
        const options = parseOptions(args);
        const outputPath = options.output || './screenshot.png';
        
        console.log(`Capturing screenshot for ID: ${id}`);
        console.log(`Output path: ${outputPath}`);
        
        // Create output directory if it doesn't exist
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Capture screenshot
        const result = await captureScreenshot(id, outputPath, {
            headless: options.headless,
            timeout: options.timeout
        });
        
        if (result.success) {
            console.log(`Screenshot successfully saved to: ${outputPath}`);
            process.exit(0);
        } else {
            console.error(`Failed to capture screenshot: ${result.error}`);
            process.exit(1);
        }
    } else if (command === 'batch') {
        const filePath = args[1];
        if (!filePath) {
            console.error('Error: Missing file path');
            console.log(helpText);
            process.exit(1);
        }
        
        if (!fs.existsSync(filePath)) {
            console.error(`Error: File not found: ${filePath}`);
            process.exit(1);
        }
        
        const options = parseOptions(args);
        const outputDir = options.outputDir || './screenshots';
        
        // Read IDs from file
        const content = fs.readFileSync(filePath, 'utf8');
        let ids = [];
        
        try {
            // Try parsing as JSON
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                ids = parsed;
            }
        } catch (e) {
            // If not JSON, treat as one ID per line
            ids = content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }
        
        if (ids.length === 0) {
            console.error('Error: No IDs found in file');
            process.exit(1);
        }
        
        console.log(`Processing ${ids.length} IDs from file: ${filePath}`);
        console.log(`Output directory: ${outputDir}`);
        
        // Create queue
        const queue = new ScreenshotQueue({
            outputDir,
            concurrency: options.concurrency || 1,
            retries: options.retries || 3
        });
        
        // Add IDs to queue
        ids.forEach(id => queue.addId(id));
        
        // Process queue
        await queue.processQueue();
        
        // Generate report
        const report = queue.generateReport();
        
        console.log(`\nProcessing complete:`);
        console.log(`- Total: ${report.total}`);
        console.log(`- Successful: ${report.successful}`);
        console.log(`- Failed: ${report.failed}`);
        console.log(`\nReport saved to: ${path.join(outputDir, 'report.json')}`);
        
        if (report.failed > 0) {
            process.exit(1);
        }
    } else {
        console.error(`Error: Unknown command: ${command}`);
        console.log(helpText);
        process.exit(1);
    }
}

// Run the CLI
main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});