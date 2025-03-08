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
        waitTime: options.waitTime || 30000, // 30 seconds default wait time (increased)
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
                '--window-size=1920,5000', // Start with a very tall window
                '--hide-scrollbars',
                '--disable-web-security',
            ],
            defaultViewport: {
                width: 1920,
                height: 5000, // Start with a very tall viewport
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
        
        // Navigate to the URL
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { 
            waitUntil: ['networkidle2', 'domcontentloaded', 'load'],
            timeout: opts.timeout 
        });
        
        // Wait for the preview to load using a universal approach with setTimeout
        console.log(`Waiting ${opts.waitTime}ms for preview to fully render...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime));
        
        // Ensure all content is loaded by scrolling through the page
        console.log('Scrolling through page to ensure all content is loaded...');
        await autoScroll(page);
        
        // Wait a bit more after scrolling
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Using a different approach to detect page height
        const dimensions = await page.evaluate(() => {
            // Force all images and other resources to load
            window.scrollTo(0, document.body.scrollHeight);
            
            // Get all elements on the page
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
            
            return {
                width: 1920,
                height: Math.max(maxHeight, document.body.scrollHeight, document.documentElement.scrollHeight) + 200 // Add padding
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
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    window.scrollTo(0, 0); // Scroll back to top
                    resolve();
                }
            }, 100);
        });
    });
}

module.exports = { captureScreenshot };