const puppeteer = require('puppeteer-core');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Add stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

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
        timeout: options.timeout || 180000, // 3 minutes default timeout (reduced)
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 20000, // 20 seconds default wait time (reduced)
    };
    
    let browser;
    try {
        // Memory-optimized configuration
        const launchOptions = {
            headless: opts.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,3000', // Reduced from 8000 to 3000
                '--hide-scrollbars',
                // Memory optimization flags
                '--single-process',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--js-flags=--max-old-space-size=512', // Limit JS memory
            ],
            defaultViewport: {
                width: 1920,
                height: 3000, // Reduced from 8000 to 3000
                deviceScaleFactor: 1,
            },
            ignoreHTTPSErrors: true,
            timeout: opts.timeout,
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
        
        // Launch browser
        browser = await puppeteerExtra.launch(launchOptions);
        
        // Open a new page
        const page = await browser.newPage();
        
        // Set user agent to a desktop browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Memory optimization: Disable cache
        await page.setCacheEnabled(false);
        
        // Navigate to the URL
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: opts.timeout 
        });
        
        // Wait for the preview to load
        console.log(`Waiting ${opts.waitTime}ms for page to render...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime));
        
        // Memory-efficient scrolling
        console.log('Scrolling to ensure all content is loaded...');
        await efficientScroll(page);
        
        // Get page height using a simpler approach
        const dimensions = await page.evaluate(() => {
            // Scroll to bottom to ensure all content is loaded
            window.scrollTo(0, document.body.scrollHeight);
            
            // Get document height with a small padding
            const height = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            ) + 100;
            
            return {
                width: 1920,
                height: height
            };
        });
        
        console.log(`Detected page dimensions: ${dimensions.width}x${dimensions.height}`);
        
        // Resize viewport to match content height
        await page.setViewport({
            width: dimensions.width,
            height: dimensions.height
        });
        
        // Take the screenshot
        console.log(`Taking screenshot and saving to: ${outputPath}`);
        await page.screenshot({
            path: outputPath,
            fullPage: true,
            type: 'png',
        });
        
        console.log('Screenshot captured successfully');
        return { success: true, id, outputPath };
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        return { success: false, error: error.message, id };
    } finally {
        // Close the browser
        if (browser) {
            await browser.close();
        }
    }
}

// Memory-efficient scrolling function
async function efficientScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            // Get initial height
            const initialHeight = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            );
            
            // Scroll in larger chunks to reduce operations
            const distance = 500;
            let lastScrollTop = 0;
            
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                
                // If we can't scroll further or we've scrolled past the initial height
                if (scrollTop === lastScrollTop || scrollTop > initialHeight + 1000) {
                    clearInterval(timer);
                    window.scrollTo(0, 0); // Scroll back to top
                    resolve();
                }
                
                lastScrollTop = scrollTop;
            }, 200); // Slower interval to reduce CPU usage
        });
    });
}

module.exports = { captureScreenshot };