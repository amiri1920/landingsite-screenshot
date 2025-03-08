const puppeteer = require('puppeteer-core');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // Already in dependencies

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
        timeout: options.timeout || 60000, // 60 seconds default timeout (reduced)
        headless: options.headless !== undefined ? options.headless : 'new',
        waitTime: options.waitTime || 15000, // 15 seconds default wait time (reduced)
        maxRetries: options.maxRetries || 2, // Number of navigation retries
        // Use the template height if known, otherwise use larger template
        templateHeight: options.templateHeight || 8295, // Default to larger template
        // Section height for sectional screenshots (to reduce memory usage)
        sectionHeight: options.sectionHeight || 2000,
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
                '--window-size=1920,2500', // Reduced to just handle one section at a time
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
                height: 2500, // Reduced to just handle one section at a time
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
        
        // Use the known template height
        const totalHeight = opts.templateHeight;
        console.log(`Using fixed template height: ${totalHeight}px`);
        
        // Calculate number of sections needed
        const sectionHeight = opts.sectionHeight;
        const numSections = Math.ceil(totalHeight / sectionHeight);
        console.log(`Capturing screenshot in ${numSections} sections of ${sectionHeight}px each`);
        
        // Create temp directory if it doesn't exist
        const tempDir = path.join(path.dirname(outputPath), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Capture screenshots in sections to reduce memory usage
        const sectionFiles = [];
        
        for (let i = 0; i < numSections; i++) {
            const sectionTop = i * sectionHeight;
            const isLastSection = i === numSections - 1;
            const currentSectionHeight = isLastSection 
                ? totalHeight - sectionTop 
                : sectionHeight;
            
            // Set viewport for this section
            await page.setViewport({
                width: 1920,
                height: currentSectionHeight
            });
            
            // Scroll to the section
            await page.evaluate((scrollTop) => {
                window.scrollTo(0, scrollTop);
            }, sectionTop);
            
            // Wait a bit for the section to render
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Capture this section
            const sectionFile = path.join(tempDir, `section_${i}.png`);
            console.log(`Capturing section ${i+1}/${numSections} (${sectionTop}px to ${sectionTop + currentSectionHeight}px)`);
            
            await page.screenshot({
                path: sectionFile,
                type: 'png'
            });
            
            sectionFiles.push(sectionFile);
            
            // Force garbage collection between sections if possible
            if (global.gc) {
                global.gc();
            }
        }
        
        // Close the browser to free memory before stitching
        if (browser) {
            await browser.close();
            browser = null;
        }
        
        // Stitch sections together using sharp
        console.log('Stitching sections together...');
        
        // Create an array of input objects for sharp
        const inputs = await Promise.all(sectionFiles.map(async (file, i) => {
            return {
                input: file,
                top: i * sectionHeight,
                left: 0
            };
        }));
        
        // Create a blank canvas of the right size
        await sharp({
            create: {
                width: 1920,
                height: totalHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
        .composite(inputs)
        .toFile(outputPath);
        
        console.log('Screenshot stitching completed successfully');
        
        // Clean up section files
        for (const file of sectionFiles) {
            fs.unlinkSync(file);
        }
        
        return { success: true, id, outputPath };
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        return { success: false, error: error.message, id };
    } finally {
        // Close the browser if it's still open
        if (browser) {
            await browser.close().catch(err => {
                console.warn('Error closing browser:', err.message);
            });
        }
    }
}

module.exports = { captureScreenshot };