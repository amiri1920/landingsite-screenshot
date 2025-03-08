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
        waitTime: options.waitTime || 45000, // 45 seconds default wait time
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
                '--window-size=1920,8000', // Reduced from 10000 to 8000
                '--hide-scrollbars',
                '--disable-web-security',
                '--disable-features=site-per-process',
                '--enable-features=NetworkService',
            ],
            defaultViewport: {
                width: 1920,
                height: 8000, // Reduced from 10000 to 8000
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
        
        // Using multiple techniques to detect page height with precision
        const dimensions = await page.evaluate(() => {
            // Force all images and other resources to load
            window.scrollTo(0, 999999);
            
            // Method 1: Get all elements on the page and find the lowest visible element
            const allElements = document.querySelectorAll('*');
            let maxHeight = 0;
            let lowestVisibleElement = null;
            
            for (const el of allElements) {
                // Skip elements with zero height or invisible elements
                if (el.offsetHeight === 0 || 
                    window.getComputedStyle(el).display === 'none' || 
                    window.getComputedStyle(el).visibility === 'hidden') {
                    continue;
                }
                
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom + window.scrollY;
                
                // Only consider elements that have actual content or background
                const hasBackground = window.getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && 
                                     window.getComputedStyle(el).backgroundColor !== 'transparent';
                const hasContent = el.textContent.trim().length > 0;
                const hasBorder = window.getComputedStyle(el).borderBottomWidth !== '0px';
                const hasImage = el.tagName === 'IMG' || 
                                window.getComputedStyle(el).backgroundImage !== 'none';
                
                if ((hasBackground || hasContent || hasBorder || hasImage) && bottom > maxHeight) {
                    maxHeight = bottom;
                    lowestVisibleElement = el;
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
                document.querySelector('#container'),
                document.querySelector('footer'),
                document.querySelector('.footer'),
                document.querySelector('#footer')
            ].filter(el => el !== null);
            
            let containerMaxHeight = 0;
            let tallestContainer = null;
            
            for (const container of containers) {
                // Get the actual rendered height, not just scrollHeight
                const rect = container.getBoundingClientRect();
                const height = rect.bottom + window.scrollY;
                
                if (height > containerMaxHeight) {
                    containerMaxHeight = height;
                    tallestContainer = container;
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
            
            // Find the most precise height by comparing methods
            // If element detection found a good candidate, prioritize it
            let finalHeight;
            let method = '';
            
            if (lowestVisibleElement && maxHeight > 0 && maxHeight + 200 >= documentHeight) {
                // If the lowest element is close to document height, use it with small padding
                finalHeight = maxHeight + 100;
                method = 'Element';
            } else if (tallestContainer && containerMaxHeight > 0 && containerMaxHeight + 200 >= documentHeight) {
                // If container height is close to document height, use it with small padding
                finalHeight = containerMaxHeight + 100;
                method = 'Container';
            } else {
                // Fall back to document height with moderate padding
                finalHeight = documentHeight + 150;
                method = 'Document';
            }
            
            // Log detailed information for debugging
            console.log(`Height detection details:
                Element method: ${maxHeight}px (${lowestVisibleElement ? lowestVisibleElement.tagName : 'none'})
                Container method: ${containerMaxHeight}px (${tallestContainer ? tallestContainer.tagName : 'none'})
                Document method: ${documentHeight}px
                Selected method: ${method}
                Final height: ${finalHeight}px
            `);
            
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
            const distance = 200;
            const timer = setInterval(() => {
                const scrollHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
                
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                // Add some randomness to the scrolling to trigger different lazy loading thresholds
                if (totalHeight % 1000 < 10) {
                    window.scrollBy(0, -100);
                    setTimeout(() => window.scrollBy(0, 100), 100);
                }
                
                if (totalHeight >= scrollHeight + 1000) {
                    clearInterval(timer);
                    window.scrollTo(0, 0); // Scroll back to top
                    resolve();
                }
            }, 100);
        });
    });
}

module.exports = { captureScreenshot };