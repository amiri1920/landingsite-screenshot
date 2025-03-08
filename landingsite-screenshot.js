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
        timeout: options.timeout || 90000, // 90 seconds default timeout
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 20000, // 20 seconds default wait time
        maxRetries: options.maxRetries || 2, // Number of navigation retries
        // Use the template height if known, otherwise use larger template size
        templateHeight: options.templateHeight || 8295, // Default to larger template
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
                '--window-size=1920,9000', // Increased to handle the largest template with extra margin
                '--hide-scrollbars',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
            ],
            defaultViewport: {
                width: 1920,
                height: 9000, // Set larger than needed to ensure full page is captured
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
        
        // Set request timeout
        page.setDefaultNavigationTimeout(opts.timeout);
        
        // Add error handler for page errors
        page.on('error', err => {
            console.error('Page error:', err);
        });
        
        // Navigate to the URL with retry mechanism
        let navigationSuccess = false;
        let navigationError = null;
        
        for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`Navigation retry attempt ${attempt}/${opts.maxRetries}...`);
                }
                
                // Use a simpler waitUntil strategy
                console.log(`Navigating to: ${url} (timeout: ${opts.timeout}ms)`);
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded', // Changed from networkidle2 to domcontentloaded
                    timeout: opts.timeout 
                });
                
                // If we get here, navigation succeeded
                navigationSuccess = true;
                console.log('Navigation completed successfully');
                break;
            } catch (err) {
                navigationError = err;
                console.warn(`Navigation attempt ${attempt + 1} failed: ${err.message}`);
                
                // If this was the last attempt, we'll throw later
                if (attempt < opts.maxRetries) {
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        // If all navigation attempts failed, try a fallback approach
        if (!navigationSuccess) {
            console.log('All navigation attempts failed, trying fallback approach...');
            
            try {
                // Try with a minimal waitUntil option
                await page.goto(url, { 
                    waitUntil: 'load',
                    timeout: opts.timeout 
                });
                
                // If we get here, fallback navigation succeeded
                navigationSuccess = true;
                console.log('Fallback navigation completed');
            } catch (err) {
                // If fallback also fails, we'll use the original error
                console.error('Fallback navigation also failed:', err.message);
                throw navigationError || err;
            }
        }
        
        // Wait for the page to render
        console.log(`Waiting ${opts.waitTime}ms for page to render...`);
        await new Promise(resolve => setTimeout(resolve, opts.waitTime));
        
        // Scroll to ensure all content is loaded
        console.log('Scrolling to ensure all content is loaded...');
        await safeScroll(page);
        
        // Try to detect which template is being used (optional)
        let templateHeight = opts.templateHeight;
        try {
            const detectedTemplate = await page.evaluate(() => {
                // Basic check for elements that might indicate template type
                const footerType1 = document.querySelector('.footer-type-1');
                const footerType2 = document.querySelector('.footer-type-2');
                
                // Very simple logic to guess the template
                if (footerType1) return 'template1';
                if (footerType2) return 'template2';
                
                // Check page structure for other clues
                const sections = document.querySelectorAll('section');
                if (sections.length > 10) return 'template1'; // More sections usually means taller template
                
                // Default to unknown
                return 'unknown';
            }).catch(() => 'unknown');
            
            // Set height based on detected template (this is optional)
            if (detectedTemplate === 'template1') {
                templateHeight = 8295;
                console.log('Detected template 1 (height: 8295px)');
            } else if (detectedTemplate === 'template2') {
                templateHeight = 6565;
                console.log('Detected template 2 (height: 6565px)');
            } else {
                console.log('Unable to detect template, using default height of 8295px');
            }
        } catch (err) {
            console.warn('Error detecting template:', err.message);
            // Continue with default height
        }
        
        // Set final dimensions using our known template heights
        const dimensions = {
            width: 1920,
            height: templateHeight
        };
        
        console.log(`Using fixed dimensions: ${dimensions.width}x${dimensions.height}`);
        
        // Resize viewport to match content height
        await page.setViewport({
            width: dimensions.width,
            height: dimensions.height
        }).catch(err => {
            console.warn('Error setting viewport:', err.message);
            // Continue anyway
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
            await browser.close().catch(err => {
                console.warn('Error closing browser:', err.message);
            });
        }
    }
}

// Safe scrolling function with error handling
async function safeScroll(page) {
    try {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                try {
                    // Get initial height
                    const initialHeight = Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight
                    );
                    
                    // Scroll down in chunks to ensure all content loads
                    const scrollStep = 500;
                    const scrollDelay = 200;
                    let currentPosition = 0;
                    
                    function scrollDown() {
                        window.scrollTo(0, currentPosition);
                        currentPosition += scrollStep;
                        
                        if (currentPosition <= initialHeight + 2000) {
                            setTimeout(scrollDown, scrollDelay);
                        } else {
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }
                    
                    scrollDown();
                    
                    // Safety timeout to ensure we don't get stuck
                    setTimeout(() => {
                        window.scrollTo(0, 0);
                        resolve();
                    }, 30000);
                } catch (err) {
                    console.error('Scroll setup error:', err);
                    resolve();
                }
            });
        });
    } catch (err) {
        console.warn('Error during scrolling:', err.message);
        // Continue anyway
    }
}

module.exports = { captureScreenshot };