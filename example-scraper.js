import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration from environment
 */
const PARALLEL_ENABLED = process.env.PARALLEL_ENABLED !== "false"; // default: true
const MAX_BROWSERS = Math.min(
  10,
  Math.max(1, parseInt(process.env.MAX_WORKERS, 10) || 5),
);
const ITEMS_PER_BROWSER = parseInt(process.env.ITEMS_PER_WORKER, 10) || 5;
const PROXY_ENABLED = process.env.PROXY_ENABLED === "true"; // default: false

/**
 * Load proxies from file
 */
function loadProxies() {
  const proxyFilePath = join(__dirname, "..", "proxies.txt");
  if (!existsSync(proxyFilePath)) {
    return [];
  }
  try {
    const content = readFileSync(proxyFilePath, "utf-8");
    const proxies = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    return proxies;
  } catch (error) {
    log(`[Proxy] Error loading proxies: ${error.message}`);
    return [];
  }
}

const PROXIES = PROXY_ENABLED ? loadProxies() : [];
if (PROXY_ENABLED) {
  log(`[Proxy] Loaded ${PROXIES.length} proxies (rotation enabled)`);
}

/**
 * Get random proxy
 */
function getRandomProxy() {
  if (PROXIES.length === 0) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

/**
 * List of user agents for rotation
 */
const USER_AGENTS = [
  // Desktop Windows - Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",

  // Desktop Windows - Edge (Berdasarkan Chromium)
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",

  // Desktop Windows - Firefox
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",

  // Desktop macOS - Chrome
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",

  // Desktop macOS - Safari
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",

  // Desktop macOS - Firefox
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",

  // Desktop Linux - Chrome & Firefox
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

/**
 * Get random user agent
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Random delay to mimic human behavior
 */
function randomDelay(min = 500, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Log helper with timestamp
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Get browser instance (with optional proxy)
 * Stores proxy auth and user agent for the browser session
 */
let currentProxyAuth = null; // Store current proxy auth for setupPage
let currentUserAgent = null; // Store current user agent for browser session

async function getBrowser() {
  const isLocal = process.env.NODE_ENV !== "production";
  const proxy = getRandomProxy();
  currentProxyAuth = null; // Reset
  currentUserAgent = getRandomUserAgent(); // Pick UA for this browser session

  // Build args array
  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
  ];

  // Add proxy if available
  if (proxy) {
    // Support formats: IP:PORT or IP:PORT:USER:PASS
    const parts = proxy.split(":");
    if (parts.length >= 2) {
      const proxyServer = `${parts[0]}:${parts[1]}`;
      baseArgs.push(`--proxy-server=http://${proxyServer}`);
      log(`[Proxy] Using proxy: ${proxyServer}`);

      // Check for authentication (IP:PORT:USER:PASS)
      if (parts.length >= 4) {
        currentProxyAuth = {
          username: parts[2],
          password: parts.slice(3).join(":"), // Handle passwords with colons
        };
        log(`[Proxy] Authenticated proxy detected (user: ${parts[2]})`);
      }
    }
  }

  return puppeteer.launch({
    headless: chromium.headless,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, ...baseArgs.slice(2)],
    ignoreHTTPSErrors: true,
  });
}

/**
 * Setup page with anti-detection measures and proxy authentication
 * Uses the user agent selected when browser was created
 */
async function setupPage(browser) {
  const page = await browser.newPage();

  // Authenticate with proxy if credentials are available
  if (currentProxyAuth) {
    await page.authenticate(currentProxyAuth);
  }

  // Use the browser's user agent (set in getBrowser)
  await page.setUserAgent(currentUserAgent);
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return page;
}

/**
 * Chunk array into N parts
 */
function chunkArray(array, numChunks) {
  const chunks = [];
  const chunkSize = Math.ceil(array.length / numChunks);
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Clean text by removing emoji, icons, and extra whitespace
 */
function cleanText(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{E000}-\u{F8FF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned || null;
}

/**
 * Search Google Maps and get list of place URLs or Data (Fast Mode)
 */
async function searchGoogleMaps(query, limit, isDetailedMode = false) {
  log(
    `[Search] Starting search for: "${query}" (limit: ${limit}, detailed: ${isDetailedMode})`,
  );

  const browser = await getBrowser();
  const page = await setupPage(browser);

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    log(`[Search] Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await new Promise((r) => setTimeout(r, randomDelay(2500, 4000)));

    // Check if single result or list
    const feed = await page.$('[role="feed"]');

    if (!feed) {
      // Check for single result page
      const hasH1 = await page.$("h1");
      const urlHasPlace =
        page.url().includes("/maps/place/") || page.url().includes("/data=");

      if (hasH1 && urlHasPlace) {
        log("[Search] Single result detected");
        const data = await extractBusinessData(page);
        await browser.close();
        return {
          isSingleResult: true,
          singleData: data,
          placeUrls: [],
          fastResults: [],
        };
      }

      // Wait and retry
      await new Promise((r) => setTimeout(r, 2000));
      const feedRetry = await page.$('[role="feed"]');
      if (!feedRetry) {
        const h1 = await page.$("h1");
        if (h1) {
          const data = await extractBusinessData(page);
          await browser.close();
          // If fast mode, return as single item in list
          if (!isDetailedMode) {
            return {
              isSingleResult: false,
              singleData: null,
              placeUrls: [],
              fastResults: [data],
            };
          }
          return {
            isSingleResult: true,
            singleData: data,
            placeUrls: [],
            fastResults: [],
          };
        }
        await browser.close();
        return {
          isSingleResult: false,
          singleData: null,
          placeUrls: [],
          fastResults: [],
        };
      }
    }

    // Multiple results - scroll and collect URLs
    log("[Search] Found results feed, processing...");

    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 10;

    while (scrollAttempts < maxScrollAttempts) {
      const items = await page.$$('[role="feed"] > div > div > a');

      if (items.length >= limit || items.length === previousCount) {
        log(`[Search] Found ${items.length} items (target: ${limit})`);
        break;
      }

      previousCount = items.length;
      log(`[Search] Scroll #${scrollAttempts + 1}: ${items.length} items...`);

      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });

      await new Promise((r) => setTimeout(r, randomDelay(1200, 2000)));
      scrollAttempts++;
    }

    // Extract: URLs (Normal Mode) OR Data (Fast Mode)
    let placeUrls = [];
    let fastResults = [];

    if (!isDetailedMode) {
      log("[Search] Extracting data from list view (Fast Mode)...");
      fastResults = await page.evaluate((maxItems) => {
        const results = [];
        const items = document.querySelectorAll('[role="feed"] > div > div'); // Card container

        for (const item of items) {
          if (results.length >= maxItems) break;

          if (!item.innerText) continue; // Skip empty

          const link = item.querySelector("a");
          if (!link) continue;

          const href = link.getAttribute("href");
          if (!href || !href.includes("/maps/place/")) continue;

          const mapsUrl = href.startsWith("http")
            ? href
            : `https://www.google.com${href}`;

          // Basic Info
          const ariaLabel = link.getAttribute("aria-label") || "";
          const textContent = item.innerText;
          const lines = textContent
            .split("\n")
            .filter((l) => l.trim().length > 0);

          // Name (Try .fontHeadlineSmall first, fallback to aria-label or first line)
          const nameEl = item.querySelector(".fontHeadlineSmall");
          const name = nameEl ? nameEl.innerText : ariaLabel || lines[0];

          // Coordinates from URL
          let latitude = null;
          let longitude = null;
          // Format 1: @lat,lng
          let coordMatch = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (coordMatch) {
            latitude = parseFloat(coordMatch[1]);
            longitude = parseFloat(coordMatch[2]);
          } else {
            // Format 2: !3d...!4d...
            const latMatch = mapsUrl.match(/!3d(-?\d+\.\d+)/);
            const lngMatch = mapsUrl.match(/!4d(-?\d+\.\d+)/);
            if (latMatch && lngMatch) {
              latitude = parseFloat(latMatch[1]);
              longitude = parseFloat(lngMatch[1]);
            }
          }

          // Rating & Reviews (Try role="img" first)
          let rating = null;
          const reviewCount = null; // Not available in list view without login

          const ratingEl = item.querySelector('span[role="img"]');
          if (ratingEl) {
            const label = ratingEl.getAttribute("aria-label") || "";
            const rMatch = label.match(/([\d,\.]+) stars/);
            if (rMatch) rating = parseFloat(rMatch[1].replace(",", "."));
          } else {
            // Fallback to aria-label on link
            const rMatch = ariaLabel.match(/([\d,\.]+) stars/);
            if (rMatch) rating = parseFloat(rMatch[1].replace(",", "."));
          }

          // Category & Address Logic
          let category = null;
          let address = null;

          // Look for line with "·" separator
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            // Look for "Category · Address" pattern
            // Need to exclude lines that are Pricing "Rp ·" or Status "Open ·" or Rating "4.5 ·"
            if (line.includes("·")) {
              const parts = line.split("·").map((s) => s.trim());
              if (parts.length >= 2) {
                const isPrice = line.match(/Rp|\$|€|£/);
                const isStatus = line.match(/Open|Clos|Opens/);
                const isRatingInfo = line.match(/\(\d+\)/); // (123)
                const isServiceOption = line.match(/Dine-in|Takeaway|Delivery/);

                if (
                  !isPrice &&
                  !isStatus &&
                  !isRatingInfo &&
                  !isServiceOption
                ) {
                  category = parts[0];
                  address = parts.slice(1).join(", ");
                  break;
                }
              }
            }
          }

          // Fallback Category if not found above
          if (!category && lines.length > 1) {
            const potential = lines[1];
            // Minimal check to avoid obviously wrong lines
            if (!potential.match(/Open|Clos|Rp|\$|\(|\)|Dine-in/)) {
              category = potential;
            }
          }

          results.push({
            name,
            address: address || "Partial/Available in Full Mode",
            latitude,
            longitude,
            rating,
            reviewCount,
            category: category || null,
            phone: null,
            website: null,
            mapsUrl,
          });
        }
        return results;
      }, limit);

      log(`[Search] Extracted ${fastResults.length} items directly from list`);
    } else {
      // Normal Mode: Collect URLs
      placeUrls = await page.evaluate((maxItems) => {
        const links = document.querySelectorAll(
          '[role="feed"] > div > div > a',
        );
        const urls = [];
        for (let i = 0; i < Math.min(links.length, maxItems); i++) {
          const href = links[i].getAttribute("href");
          if (href && href.includes("/maps/place/")) {
            urls.push(
              href.startsWith("http") ? href : `https://www.google.com${href}`,
            );
          }
        }
        return urls;
      }, limit);

      log(`[Search] Collected ${placeUrls.length} place URLs`);
    }

    await browser.close();

    return { isSingleResult: false, singleData: null, placeUrls, fastResults };
  } catch (error) {
    log(`[Search] Error: ${error.message}`);
    await browser.close();
    throw error;
  }
}

/**
 * Scrape a single place URL
 */
async function scrapePlace(url, browser) {
  const page = await setupPage(browser);

  try {
    // Use networkidle2 to ensure all JS is fully loaded (fixes cold start issues)
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait specifically for the rating stars element to appear (key indicator page is ready)
    await page
      .waitForSelector('[role="img"][aria-label*="star"]', {
        timeout: 15000,
        visible: true,
      })
      .catch(() => {});

    // Additional buffer for dynamic content
    await new Promise((r) => setTimeout(r, randomDelay(1500, 2500)));

    const data = await extractBusinessData(page);
    await page.close();
    return data;
  } catch (error) {
    log(`[Scrape] Error scraping ${url}: ${error.message}`);
    await page.close();
    return null;
  }
}

/**
 * Scrape a chunk of URLs with one browser
 */
async function scrapeChunk(urls, chunkIndex) {
  log(`[Worker ${chunkIndex + 1}] Starting, ${urls.length} URLs to process`);

  const browser = await getBrowser();

  // Log the UA and proxy being used by this worker
  const shortUA = currentUserAgent
    ? currentUserAgent.match(
        /Chrome\/[\d.]+|Firefox\/[\d.]+|Safari\/[\d.]+|Edg\/[\d.]+/,
      )?.[0] || "Unknown"
    : "Unknown";
  const proxyInfo = currentProxyAuth
    ? `Authenticated Proxy`
    : PROXY_ENABLED
      ? "Public Proxy"
      : "No Proxy";
  log(`[Worker ${chunkIndex + 1}] UA: ${shortUA}, Proxy: ${proxyInfo}`);

  const results = [];

  try {
    // WARMUP: Navigate to Google Maps homepage to establish session/cookies
    const warmupPage = await setupPage(browser);
    log(
      `[Worker ${chunkIndex + 1}] Warming up browser with Google Maps homepage...`,
    );
    await warmupPage
      .goto("https://www.google.com/maps?hl=en", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 2000)); // Let cookies settle
    await warmupPage.close();
    log(`[Worker ${chunkIndex + 1}] Warmup complete, starting scrape...`);

    for (let i = 0; i < urls.length; i++) {
      log(`[Worker ${chunkIndex + 1}] Processing ${i + 1}/${urls.length}`);
      const data = await scrapePlace(urls[i], browser);
      if (data && data.name) {
        results.push(data);
        log(`[Worker ${chunkIndex + 1}] Extracted: ${data.name}`);
      }
    }
  } catch (error) {
    log(`[Worker ${chunkIndex + 1}] Error: ${error.message}`);
  } finally {
    await browser.close();
  }

  log(`[Worker ${chunkIndex + 1}] Done, extracted ${results.length} results`);
  return results;
}

/**
 * Main function - Parallel scraping with pagination & Fast Mode
 * @param {string} query - Search query
 * @param {number} fromIndex - Start index (1-based)
 * @param {number} toIndex - End index (1-based, inclusive)
 * @param {boolean} isDetailedMode - If true, scrape full details (default: false)
 */
export async function scrapeGoogleMaps(
  query,
  fromIndex = 1,
  toIndex = 20,
  isDetailedMode = false,
) {
  const startTime = Date.now();
  log(`Starting scrape for: "${query}" (from: ${fromIndex}, to: ${toIndex})`);

  // Step 1: Search and get all URLs or Fast Results
  const { isSingleResult, singleData, placeUrls, fastResults } =
    await searchGoogleMaps(query, toIndex, isDetailedMode);

  // Handle single result
  if (isSingleResult) {
    log(`Single result found, returning immediately`);
    return {
      results: singleData ? [singleData] : [],
      totalAvailable: singleData ? 1 : 0,
      actualFrom: 1,
      actualTo: 1,
    };
  }

  // Handle No Results
  if (
    (isDetailedMode && placeUrls.length === 0) ||
    (!isDetailedMode && fastResults.length === 0)
  ) {
    log(`No results found`);
    return {
      results: [],
      totalAvailable: 0,
      actualFrom: fromIndex,
      actualTo: fromIndex,
    };
  }

  // Handle Fast Mode Results
  if (!isDetailedMode) {
    const totalAvailable = fastResults.length;
    const actualFrom = Math.min(fromIndex, totalAvailable);
    const actualTo = Math.min(toIndex, totalAvailable);

    // Slice results
    // Ensure indices are valid
    const startIdx = Math.max(0, actualFrom - 1);
    const endIdx = actualTo;

    const results = fastResults.slice(startIdx, endIdx);

    const duration = Date.now() - startTime;
    log(
      `[Fast Mode] Done! Extracted ${results.length} results in ${duration}ms`,
    );

    return {
      results,
      totalAvailable,
      actualFrom,
      actualTo,
    };
  }

  const totalAvailable = placeUrls.length;

  // Adjust indices if they exceed available
  const actualFrom = Math.min(fromIndex, totalAvailable);
  const actualTo = Math.min(toIndex, totalAvailable);

  // Convert to 0-based indices for slicing
  const startIdx = actualFrom - 1;
  const endIdx = actualTo;

  // Step 2: Get URLs for requested range
  const urlsToScrape = placeUrls.slice(startIdx, endIdx);

  log(
    `Total available: ${totalAvailable}, scraping from ${actualFrom} to ${actualTo} (${urlsToScrape.length} items)`,
  );

  // Check if parallel mode is enabled
  if (!PARALLEL_ENABLED || urlsToScrape.length <= ITEMS_PER_BROWSER) {
    // Sequential mode - use single browser
    log(
      `[Sequential Mode] Scraping ${urlsToScrape.length} places with 1 browser`,
    );
    const results = await scrapeChunk(urlsToScrape, 0);
    const duration = Date.now() - startTime;
    log(`Done! Extracted ${results.length} results in ${duration}ms`);
    return {
      results,
      totalAvailable,
      actualFrom,
      actualTo,
    };
  }

  // Parallel mode
  const browsersNeeded = Math.min(
    MAX_BROWSERS,
    Math.ceil(urlsToScrape.length / ITEMS_PER_BROWSER),
  );

  log(
    `[Parallel Mode] Scraping ${urlsToScrape.length} places with ${browsersNeeded} browsers (max: ${MAX_BROWSERS})`,
  );

  // Step 3: Divide work into chunks
  const chunks = chunkArray(urlsToScrape, browsersNeeded);

  // Step 4: Parallel scraping
  log(`Starting ${chunks.length} parallel workers...`);
  const chunkResults = await Promise.all(
    chunks.map((chunk, index) => scrapeChunk(chunk, index)),
  );

  // Step 5: Combine results
  const results = chunkResults.flat();

  const duration = Date.now() - startTime;
  log(`Done! Extracted ${results.length} results in ${duration}ms`);

  return {
    results,
    totalAvailable,
    actualFrom,
    actualTo,
  };
}

/**
 * Extract business data from the details panel
 */
async function extractBusinessData(page) {
  const data = {
    name: null,
    address: null,
    latitude: null,
    longitude: null,
    rating: null,
    reviewCount: null,
    category: null,
    phone: null,
    website: null,
    mapsUrl: null,
  };

  try {
    // Wait for the main header to ensure page is loaded
    await page
      .waitForSelector("h1", { timeout: 10000, visible: true })
      .catch(() => {});

    // Small delay to let dynamic fields (like review count) hydrate
    await new Promise((r) => setTimeout(r, 2000));

    data.mapsUrl = page.url();

    // Extract coordinates from URL
    // Format 1: @lat,lng (standard)
    let coordMatch = data.mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      data.latitude = parseFloat(coordMatch[1]);
      data.longitude = parseFloat(coordMatch[2]);
    } else {
      // Format 2: !3dlat!4dlng (in data= parameter)
      const latMatch = data.mapsUrl.match(/!3d(-?\d+\.\d+)/);
      const lngMatch = data.mapsUrl.match(/!4d(-?\d+\.\d+)/);
      if (latMatch && lngMatch) {
        data.latitude = parseFloat(latMatch[1]);
        data.longitude = parseFloat(lngMatch[1]);
      }
    }

    // Extract name from URL
    const nameFromUrl = data.mapsUrl.match(/\/maps\/place\/([^/@]+)/);
    if (nameFromUrl) {
      data.name = decodeURIComponent(nameFromUrl[1].replace(/\+/g, " "));
    }

    // Fallback: get name from h1
    if (!data.name) {
      const nameEl = await page.$("h1");
      if (nameEl) {
        data.name = cleanText(
          await page.evaluate((el) => el.textContent, nameEl),
        );
      }
    }

    // Scroll slightly to trigger any lazy loading
    await page.evaluate(() => window.scrollBy(0, 300));

    // Rating & Review Count (from Star Label)
    const ratingEl = await page.$('[role="img"][aria-label*="star"]');
    if (ratingEl) {
      const ratingText = await page.evaluate(
        (el) => el.getAttribute("aria-label"),
        ratingEl,
      );

      const ratingMatch = ratingText?.match(/([\d,\.]+)/);
      if (ratingMatch) {
        data.rating = parseFloat(ratingMatch[1].replace(",", "."));
      }
      // Try to get reviews from the same label: "4.4 stars 578 reviews"
      const reviewInRating = ratingText?.match(/([\d,\.]+)\s+reviews/i);
      if (reviewInRating) {
        data.reviewCount = parseInt(
          reviewInRating[1].replace(/[,\.]/g, ""),
          10,
        );
      }
    }

    // Review count fallback (ONLY if not already set from star label)
    if (!data.reviewCount) {
      let reviewCount = null;
      const reviewEl = await page.$('button[aria-label*="review"]');
      if (reviewEl) {
        const reviewText = await page.evaluate(
          (el) => el.textContent,
          reviewEl,
        );
        const reviewMatch = reviewText?.match(/([\d,\.]+)/);
        if (reviewMatch)
          reviewCount = parseInt(reviewMatch[1].replace(/[,\.]/g, ""), 10);
      }
      // Fallback 1: Check inside rating button
      if (!reviewCount) {
        const ratingBtn = await page.$('div[jsaction*="pane.rating"]');
        if (ratingBtn) {
          const text = await page.evaluate((el) => el.textContent, ratingBtn);
          const match = text.match(/\(([\d,\.]+)\)/);
          if (match) reviewCount = parseInt(match[1].replace(/[,\.]/g, ""), 10);
        }
      }
      // Fallback 2: Check all buttons/spans in header for (1,234)
      if (!reviewCount) {
        // Often found near the rating stars in the main header
        const headerSection = await page.$(".HeaderHeader"); // Generic fallback class often present
        if (headerSection) {
          const text = await page.evaluate((el) => el.innerText, headerSection);
          const match = text.match(/\(([\d,\. ]+)\)/);
          if (match)
            reviewCount = parseInt(match[1].replace(/[,\.\s]/g, ""), 10);
        } else {
          // Last resort: scan page text for pattern near stars (risky but better than null)
          const bodyText = await page.evaluate(() => document.body.innerText);
          // Look for "4.9 (1,152)" pattern
          const broadMatch = bodyText.matchAll(/[\d\.]+\s+\(([\d,\. ]+)\)/g);
          for (const m of broadMatch) {
            // Heuristic: review count usually > 0
            const val = parseInt(m[1].replace(/[,\.\s]/g, ""), 10);
            if (val > 0) {
              reviewCount = val;
              break;
            }
          }
        }
      }
      // Only overwrite if we found something
      if (reviewCount) {
        data.reviewCount = reviewCount;
      }
    }

    // Category
    const categoryEl = await page.$('button[jsaction*="category"]');
    if (categoryEl) {
      data.category = cleanText(
        await page.evaluate((el) => el.textContent, categoryEl),
      );
    }

    // Address
    const addressEl = await page.$('button[data-item-id="address"]');
    if (addressEl) {
      data.address = cleanText(
        await page.evaluate(
          (el) => el.getAttribute("aria-label") || el.textContent,
          addressEl,
        ),
      );
      // Remove "Address: " prefix if present in aria-label
      data.address = data.address.replace(/^Address: /, "");
    }

    // Phone
    const phoneEl = await page.$('button[data-item-id*="phone"]');
    if (phoneEl) {
      data.phone = cleanText(
        await page.evaluate(
          (el) => el.getAttribute("aria-label") || el.textContent,
          phoneEl,
        ),
      );
      data.phone = data.phone.replace(/^Phone: /, "");
    } else {
      // Fallback: Search for buttons starting with 0 or + (heuristic)
      const buttons = await page.$$("button[data-item-id]");
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text && (text.startsWith("+") || text.match(/^\(?\d{3}\)?/))) {
          data.phone = cleanText(text);
          break;
        }
      }
    }

    // Website
    const websiteEl = await page.$('a[data-item-id="authority"]');
    if (websiteEl) {
      data.website = await page.evaluate(
        (el) => el.getAttribute("href"),
        websiteEl,
      );
    } else {
      // Fallback: Look for link with text "Website"
      const links = await page.$$("a");
      for (const link of links) {
        const text = await page.evaluate((el) => el.textContent, link);
        if (text && text.trim().toLowerCase() === "website") {
          data.website = await page.evaluate(
            (el) => el.getAttribute("href"),
            link,
          );
          break;
        }
        const ariaLabel = await page.evaluate(
          (el) => el.getAttribute("aria-label"),
          link,
        );
        if (ariaLabel && ariaLabel.toLowerCase() === "website") {
          data.website = await page.evaluate(
            (el) => el.getAttribute("href"),
            link,
          );
          break;
        }
      }
    }
  } catch (error) {
    log(`Error extracting business data: ${error.message}`);
  }

  return data;
}

export default { scrapeGoogleMaps };
