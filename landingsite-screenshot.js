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
        // Extremely memory-efficient configuration
        const launchOptions = {
            headless: opts.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1920', // Restored to 1920 width
                '--hide-scrollbars',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--js-flags=--max-old-space-size=512', // Limit JS memory
                '--single-process', // Use single process
                '--disable-browser-side-navigation',
                '--disable-features=site-per-process',
                '--disable-features=BlinkGenPropertyTrees',
                '--disable-translate',
                '--disable-sync',
            ],
            defaultViewport: {
                width: 1920, // Restored to 1920 width
                height: 1200, // Keep smaller initial viewport height
                deviceScaleFactor: 1,
            },
            ignoreHTTPSErrors: true,
            timeout: opts.timeout,
            dumpio: false, // Don't pipe browser process stdout/stderr
            handleSIGINT: true,
            handleSIGTERM: true,
            handleSIGHUP: true,
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
        
        // Launch browser with minimal memory usage
        console.log('Launching browser with memory-efficient settings...');
        browser = await puppeteer.launch(launchOptions);
        
        // Open a new page
        const page = await browser.newPage();
        
        // Aggressive memory optimization
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });
        await client.send('Page.enable');

        // Set up javascript error and console message handlers
        page.on('error', err => {
            console.error('Page error:', err.message);
        });
        
        // Disable cache to save memory
        await page.setCacheEnabled(false);
        
        // Set request timeout
        page.setDefaultNavigationTimeout(opts.timeout);
        
        // Set user agent to a desktop browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'media', 'font', 'other'].includes(resourceType)) {
                request.continue();
            } else if (resourceType === 'stylesheet') {
                request.continue();
            } else if (['script', 'xhr', 'fetch'].includes(resourceType)) {
                request.continue();
            } else {
                request.continue();
            }
        });
        
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
        
        // Simple scroll to ensure all content is loaded
        console.log('Scrolling to ensure all content is loaded...');
        await page.evaluate(async () => {
            const totalHeight = document.body.scrollHeight;
            const viewportHeight = window.innerHeight;
            let scrollTop = 0;
            
            while (scrollTop < totalHeight) {
                window.scrollTo(0, scrollTop);
                await new Promise(resolve => setTimeout(resolve, 100));
                scrollTop += viewportHeight / 2; // Scroll by half the viewport height
            }
            
            // Scroll back to top
            window.scrollTo(0, 0);
        });
        
        // Wait a bit after scrolling
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Use the specified template height for the viewport
        console.log(`Setting viewport to template height: ${opts.templateHeight}px`);
        await page.setViewport({
            width: 1920, // Restored to 1920 width
            height: opts.templateHeight
        });
        
        // Take the screenshot
        console.log(`Taking screenshot and saving to: ${outputPath}`);
        await page.screenshot({
            path: outputPath,
            fullPage: true,
            type: 'png',
            omitBackground: true, // Reduces memory usage
        });
        
        console.log('Screenshot captured successfully');
        
        // Close the page to free up memory
        await page.close();
        
        return { success: true, id, outputPath };
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        return { success: false, error: error.message, id };
    } finally {
        // Close the browser
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed');
            } catch (err) {
                console.warn('Error closing browser:', err.message);
            }
        }
        
        // Force garbage collection
        if (global.gc) {
            global.gc();
        }
    }
}

module.exports = { captureScreenshot };