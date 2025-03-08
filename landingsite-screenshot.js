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
        timeout: options.timeout || 180000, // 3 minutes default timeout
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 25000, // 25 seconds default wait time
    };
    
    let browser;
    try {
        // Balanced configuration for memory and full page capture
        const launchOptions = {
            headless: opts.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,5000', // Increased from 3000 to 5000
                '--hide-scrollbars',
                // Memory optimization flags (but not as aggressive)
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
            ],
            defaultViewport: {
                width: 1920,
                height: 5000, // Increased from 3000 to 5000
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
            waitUntil: 'networkidle2',
            timeout: opts.timeout 
        });
        
        // Initial wait for the page to start rendering
        console.log(`Initial wait: ${opts.waitTime/2}ms for page to start rendering...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime/2));
        
        // First scroll pass to trigger lazy loading
        console.log('First scroll pass to trigger lazy loading...');
        await balancedScroll(page);
        
        // Second wait to ensure all content loads
        console.log(`Second wait: ${opts.waitTime/2}ms for content to finish loading...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime/2));
        
        // Get page height using a balanced approach
        const dimensions = await page.evaluate(() => {
            // Force all images and other resources to load
            window.scrollTo(0, document.body.scrollHeight);
            
            // Method 1: Basic document properties
            const documentHeight = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            
            // Method 2: Check for specific containers that might contain the main content
            // This is more memory-efficient than checking all elements
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
            for (const container of containers) {
                const rect = container.getBoundingClientRect();
                const height = rect.bottom + window.scrollY;
                if (height > containerMaxHeight) {
                    containerMaxHeight = height;
                }
            }
            
            // Method 3: Check a sample of elements (not all elements to save memory)
            // Get all elements with specific tags that are likely to be at the bottom
            const bottomElements = [
                ...document.querySelectorAll('footer, .footer, #footer, .bottom, #bottom'),
                ...document.querySelectorAll('section:last-child, div:last-child')
            ];
            
            let elementsMaxHeight = 0;
            for (const el of bottomElements) {
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom + window.scrollY;
                if (bottom > elementsMaxHeight) {
                    elementsMaxHeight = bottom;
                }
            }
            
            // Take the maximum of all methods and add padding
            const finalHeight = Math.max(documentHeight, containerMaxHeight, elementsMaxHeight) + 200;
            
            console.log(`Height detection: Document=${documentHeight}, Containers=${containerMaxHeight}, Elements=${elementsMaxHeight}, Final=${finalHeight}`);
            
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

// Balanced scrolling function - more thorough than efficient but less memory-intensive than the original
async function balancedScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            // Get initial height
            const initialHeight = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            );
            
            // Scroll in moderate chunks
            const distance = 300;
            let totalHeight = 0;
            let lastScrollTop = 0;
            let stuckCount = 0;
            
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                
                // If we're stuck at the same position
                if (scrollTop === lastScrollTop) {
                    stuckCount++;
                    // If we're stuck for 3 iterations, try scrolling to the bottom directly
                    if (stuckCount >= 3) {
                        window.scrollTo(0, 999999);
                        // Wait a bit and then try continuing
                        setTimeout(() => {
                            stuckCount = 0;
                        }, 500);
                    }
                } else {
                    stuckCount = 0;
                }
                
                // If we've scrolled well past the initial height or we're stuck for too long
                if (totalHeight >= initialHeight + 2000 || stuckCount >= 5) {
                    clearInterval(timer);
                    
                    // Scroll back to top
                    window.scrollTo(0, 0);
                    
                    // Wait a bit and then resolve
                    setTimeout(resolve, 500);
                }
                
                lastScrollTop = scrollTop;
            }, 150); // Moderate interval
        });
    });
}

module.exports = { captureScreenshot };