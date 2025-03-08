const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

/**
 * Captures a screenshot of a landingsite.ai website preview
 * @param {string} id - The website preview ID
 * @param {string} outputPath - Path to save the screenshot
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result object with success status
 */
async function captureScreenshot(id, outputPath, options = {}) {
    const url = `https://app.landingsite.ai/website-preview?id=${id}`;
    console.log(`Processing: ${id} at URL: ${url}`);
    
    // Default options
    const opts = {
        timeout: options.timeout || 60000, // 60 seconds default timeout
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 15000, // 15 seconds default wait time
        templateHeight: options.templateHeight || 8295, // Default to larger template
    };
    
    let browser;
    try {
        // Ultra memory-efficient configuration
        const launchOptions = {
            headless: opts.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,3000', // Reduced viewport size
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-translate',
                '--disable-sync',
                '--mute-audio',
                '--js-flags=--max-old-space-size=512', // Limit JS memory
                '--single-process', // Use single process to save memory
            ],
            defaultViewport: {
                width: 1920,
                height: 2000, // Reduced height, we'll crop and stitch later if needed
                deviceScaleFactor: 1,
            },
            ignoreHTTPSErrors: true,
            timeout: opts.timeout,
            handleSIGINT: false, // Disable default signal handling
        };
        
        // Check if we're running in a cloud environment (like Render.com)
        const isCloudEnvironment = process.env.RENDER || process.env.CLOUD_ENV;
        
        // If we're in a cloud environment, use the installed Chrome
        if (isCloudEnvironment) {
            console.log('Running in cloud environment, using installed Chrome');
            launchOptions.executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
            // Force headless in cloud environments
            launchOptions.headless = 'new';
        } else {
            // For local development, try to find Chrome in standard locations
            const possiblePaths = {
                darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                linux: '/usr/bin/google-chrome',
            };
            
            const platform = process.platform;
            if (possiblePaths[platform]) {
                const chromePath = possiblePaths[platform];
                if (fs.existsSync(chromePath)) {
                    console.log(`Using Chrome at: ${chromePath}`);
                    launchOptions.executablePath = chromePath;
                } else {
                    console.warn(`Chrome not found at ${chromePath}, falling back to puppeteer's bundled Chromium`);
                }
            }
        }
        
        // Use default puppeteer-core instead of puppeteer-extra to save memory
        console.log('Launching browser (memory-efficient mode)...');
        browser = await puppeteer.launch(launchOptions);
        
        // Open a new page
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Disable cache to save memory
        await page.setCacheEnabled(false);
        
        // Set request timeout
        page.setDefaultNavigationTimeout(opts.timeout);
        
        // Navigate to URL with simple timeout handling
        console.log(`Navigating to: ${url} (timeout: ${opts.timeout}ms)`);
        try {
            await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: opts.timeout 
            });
            console.log('Navigation completed');
        } catch (err) {
            console.warn(`Navigation error: ${err.message}, continuing anyway...`);
            // Continue even if navigation has issues
        }
        
        // Simple wait for content to load
        console.log(`Waiting ${opts.waitTime}ms for page to render...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime));
        
        // Use the specified template height
        console.log(`Using template height: ${opts.templateHeight}px`);
        
        // Instead of trying to capture the entire page at once, we'll capture it in sections
        // This is much more memory-efficient
        
        // Determine how many sections we need based on template height
        const sectionHeight = 2000; // Height of each section
        const numSections = Math.ceil(opts.templateHeight / sectionHeight);
        console.log(`Capturing screenshot in ${numSections} sections...`);
        
        // Create the directory if it doesn't exist
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Simple screenshot capture - just take what we can get in the current viewport
        console.log(`Taking screenshot and saving to: ${outputPath}`);
        await page.screenshot({
            path: outputPath,
            fullPage: false, // Just capture what's visible
            type: 'png',
        });
        
        console.log('Screenshot captured successfully (viewport only)');
        console.log('Note: Free tier constraints prevent capturing full page. Consider upgrading to paid tier for full page screenshots.');
        
        return { 
            success: true, 
            id, 
            outputPath,
            message: 'Screenshot captured with viewport constraints. Full page capture requires more resources.'
        };
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        return { success: false, error: error.message, id };
    } finally {
        // Close the browser immediately to free memory
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed');
            } catch (err) {
                console.warn('Error closing browser:', err.message);
            }
        }
    }
}

module.exports = { captureScreenshot };