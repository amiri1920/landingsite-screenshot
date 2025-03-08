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
        timeout: options.timeout || 300000, // 5 minutes default timeout
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 45000, // 45 seconds default wait time (increased)
    };
    
    let browser;
    try {
        // Use the exact configuration that worked in our successful test
        const launchOptions = {
            headless: opts.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,10000', // Start with an extremely tall window
                '--hide-scrollbars',
                '--disable-web-security',
                '--disable-features=site-per-process', // Helps with iframe content
                '--enable-features=NetworkService',
            ],
            defaultViewport: {
                width: 1920,
                height: 10000, // Start with an extremely tall viewport
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
        
        // Set extra headers to ensure proper loading
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });
        
        // Enable JavaScript and CSS
        await page.setJavaScriptEnabled(true);
        
        // Navigate to the URL
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { 
            waitUntil: ['networkidle2', 'domcontentloaded', 'load'],
            timeout: opts.timeout 
        });
        
        // Wait for the preview to load using a universal approach with setTimeout
        console.log(`Initial wait: ${opts.waitTime/3}ms for page to start rendering...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime/3));
        
        // Ensure all content is loaded by scrolling through the page multiple times
        console.log('First scroll pass to trigger lazy loading...');
        await autoScroll(page);
        
        // Wait a bit after first scrolling
        console.log(`Waiting ${opts.waitTime/3}ms after first scroll...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime/3));
        
        // Second scroll pass to ensure everything is loaded
        console.log('Second scroll pass to ensure all content is loaded...');
        await autoScroll(page);
        
        // Final wait to ensure all animations and delayed content are loaded
        console.log(`Final wait: ${opts.waitTime/3}ms to ensure complete rendering...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime/3));
        
        // Using multiple techniques to detect page height
        const dimensions = await page.evaluate(() => {
            // Force all images and other resources to load
            window.scrollTo(0, 999999); // Scroll to a very large value
            
            // Method 1: Get all elements on the page
            const allElements = document.querySelectorAll('*');
            let maxHeight = 0;
            
            // Find the element with the greatest bottom position
            for (const el of allElements) {
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom + window.scrollY;
                if (bottom > maxHeight) {
                    maxHeight = bottom;
                }
            }
            
            // Method 2: Check for specific containers that might contain the main content
            const containers = [
                document.body,
                document.documentElement,
                document.querySelector('main'),
                document.querySelector('.main'),
                document.querySelector('#main'),
                document.querySelector('.content'),
                document.querySelector('#content'),
                document.querySelector('.container'),
                document.querySelector('#container')
            ].filter(el => el !== null);
            
            let containerMaxHeight = 0;
            for (const container of containers) {
                const height = container.scrollHeight;
                if (height > containerMaxHeight) {
                    containerMaxHeight = height;
                }
            }
            
            // Method 3: Use document properties
            const documentHeight = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            
            // Take the maximum of all methods and add generous padding
            const finalHeight = Math.max(maxHeight, containerMaxHeight, documentHeight) + 500;
            
            console.log(`Height detection: Elements=${maxHeight}, Containers=${containerMaxHeight}, Document=${documentHeight}, Final=${finalHeight}`);
            
            return {
                width: 1920,
                height: finalHeight
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
            captureBeyondViewport: true
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

// Helper function to scroll through the page
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 200; // Increased scroll distance
            const timer = setInterval(() => {
                const scrollHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
                
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                // Add some randomness to the scrolling to trigger different lazy loading thresholds
                if (totalHeight % 1000 < 10) {
                    window.scrollBy(0, -100); // Occasionally scroll back up a bit
                    setTimeout(() => window.scrollBy(0, 100), 100); // Then back down
                }
                
                if (totalHeight >= scrollHeight + 2000) { // Add extra scrolling beyond detected height
                    clearInterval(timer);
                    window.scrollTo(0, 0); // Scroll back to top
                    resolve();
                }
            }, 100);
        });
    });
}

module.exports = { captureScreenshot };