import chromium from "@sparticuz/chromium";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerCore from "puppeteer-core";
import express from "express";
import fs from "node:fs";
import "dotenv/config";

puppeteerExtra.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getWindowsChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    `C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe`,
    `C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`,
    `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
  ];

  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

const isWindows = process.platform === "win32";
puppeteerExtra.puppeteer = puppeteerCore;

const executablePath = isWindows
  ? getWindowsChromePath()
  : await chromium.executablePath();

if (!executablePath) {
  throw new Error(
    isWindows
      ? "Browser not found. Install Chrome/Edge/Brave, or set the executable path manually."
      : "Chromium executablePath not found (serverless).",
  );
}

let browserPromise;
let browserRef;

async function createBrowser() {
  const browser = await puppeteerExtra.launch({
    executablePath,
    args: isWindows ? [] : chromium.args,
    headless: isWindows ? false : chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
  browser.on("disconnected", () => {
    browserRef = null;
    browserPromise = null;
  });
  return browser;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = createBrowser();
  }
  browserRef = await browserPromise;
  return browserRef;
}

function extractLatLngFromUrl(url) {
  if (!url) return { latitude: null, longitude: null };
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return {
      latitude: Number(atMatch[1]),
      longitude: Number(atMatch[2]),
    };
  }
  const bangMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bangMatch) {
    return {
      latitude: Number(bangMatch[1]),
      longitude: Number(bangMatch[2]),
    };
  }
  return { latitude: null, longitude: null };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanScrollFeed(page) {
  const steps = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < steps; i += 1) {
    const delta = 220 + Math.floor(Math.random() * 180);
    await page.evaluate((scrollBy) => {
      const feed = document.querySelector("div[role='feed']");
      const target = feed || document.scrollingElement || document.body;
      target.scrollBy(0, scrollBy);
    }, delta);
    await delay(300 + Math.floor(Math.random() * 400));
  }
  await delay(400 + Math.floor(Math.random() * 600));
}

async function extractPlaceData(page) {
  await page.waitForSelector("h1[role='heading']", { timeout: 15000 });
  const name = await page.$eval(
    "h1[role='heading']",
    (el) => el.textContent?.trim() ?? "",
  );
  const address = await page.evaluate(() => {
    const addressNode =
      document.querySelector("[data-item-id='address']") ||
      document.querySelector("button[aria-label^='Address']") ||
      document.querySelector("div[aria-label^='Address']");
    if (!addressNode) return "";
    return addressNode.textContent?.trim() ?? "";
  });
  const mapsUrl = page.url();
  const { latitude, longitude } = extractLatLngFromUrl(mapsUrl);
  return {
    name,
    address,
    latitude,
    longitude,
    mapsUrl,
  };
}

async function extractListResults(page, limit) {
  const results = [];
  const seen = new Set();

  for (let attempt = 0; attempt < 8 && results.length < limit; attempt += 1) {
    const batch = await page.evaluate(() => {
      const looksLikeAddress = (text) => {
        if (!text) return false;
        const t = text.trim();
        if (t.length < 6) return false;
        if (
          /review|reviews|star|rating|minute|mins|open|closed|\$\$|Rp\s?\d/i.test(
            t,
          )
        ) {
          return false;
        }
        if (
          /\b(jl\.|jalan|no\.|rt|rw|kec\.|kab\.|desa|kel\.|kota|provinsi)\b/i.test(
            t,
          )
        ) {
          return true;
        }
        if (/[0-9]/.test(t) && t.includes(",")) return true;
        if (/[0-9]/.test(t) && /st\.|street|road|rd\.|ave\.|avenue/i.test(t)) {
          return true;
        }
        return false;
      };

      const cleanText = (text) => text.replace(/\s+/g, " ").trim();
      const isNoise = (text) =>
        /review|reviews|star|rating|minute|mins|open|closed|\$\$|Rp\s?\d/i.test(
          text,
        );

      const articles = Array.from(
        document.querySelectorAll("div[role='feed'] div[role='article']"),
      );
      return articles.map((article) => {
        const link =
          article.querySelector("a[href*='/maps/place']") ||
          article.querySelector("a[href*='/maps/search']");
        const mapsUrl = link?.href ?? "";
        const name =
          link?.getAttribute("aria-label")?.trim() ??
          article
            .querySelector("div[role='heading'], span[role='heading']")
            ?.textContent?.trim() ??
          "";
        let address =
          article.querySelector("[data-item-id='address']")?.textContent ?? "";

        if (!address) {
          const lines = article.innerText
            .split("\n")
            .map((line) => cleanText(line))
            .filter(Boolean);

          for (const line of lines) {
            if (line.includes("·")) {
              const parts = line.split("·").map((part) => cleanText(part));
              if (parts.length >= 2) {
                const tail = parts[parts.length - 1] ?? "";
                if (!isNoise(line) && looksLikeAddress(tail)) {
                  address = tail;
                  break;
                }
              }
            }
          }

          for (const line of lines) {
            if (looksLikeAddress(line)) {
              address = line;
              break;
            }
          }

          if (!address) {
            address =
              lines.find((line) => line.includes(",") && /[0-9]/.test(line)) ??
              "";
          }
        }

        address = cleanText(address);
        if (address.includes("�")) {
          const parts = address.split("�").map((part) => cleanText(part));
          const tail = parts[parts.length - 1] ?? "";
          if (looksLikeAddress(tail)) {
            address = tail;
          }
        }

        return {
          name,
          address,
          mapsUrl,
        };
      });
    });

    for (const item of batch) {
      const key = `${item.mapsUrl}|${item.name}|${item.address}`;
      if (!seen.has(key) && (item.name || item.address)) {
        seen.add(key);
        results.push(item);
      }
      if (results.length >= limit) break;
    }

    if (results.length >= limit) break;
    await humanScrollFeed(page);
  }

  return results.slice(0, limit).map((item) => {
    const { latitude, longitude } = extractLatLngFromUrl(item.mapsUrl);
    return {
      name: item.name,
      address: item.address,
      latitude,
      longitude,
      mapsUrl: item.mapsUrl,
    };
  });
}

async function scrapeGoogleMaps(query, limit, requestId = "unknown") {
  const run = async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    console.log(`[${requestId}] Using UA: ${userAgent}`);

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      query,
    )}?hl=en`;

    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const zoomValue = "0.5";
      document.documentElement.style.zoom = zoomValue;
      document.body.style.zoom = zoomValue;
    });

    let mode = null;
    try {
      mode = await Promise.race([
        page
          .waitForSelector("div[role='feed']", { timeout: 8000 })
          .then(() => "list"),
        page
          .waitForSelector("h1[role='heading']", { timeout: 8000 })
          .then(() => "place"),
      ]);
    } catch (err) {
      mode = null;
    }

    const results = [];

    if (mode === "list") {
      await page.waitForSelector("div[role='feed'] div[role='article']", {
        timeout: 15000,
      });
      results.push(...(await extractListResults(page, limit)));
    } else if (mode === "place") {
      results.push(await extractPlaceData(page));
    }

    await page.close();
    return results;
  };

  try {
    return await run();
  } catch (error) {
    const message = error?.message ?? "";
    if (message.includes("Connection closed")) {
      browserRef = null;
      browserPromise = null;
      return await run();
    }
    throw error;
  }
}

const app = express();
const apiKey = process.env.API_KEY ?? "";

app.use((req, res, next) => {
  const requestId = Math.random().toString(36).slice(2, 10);
  const startedAt = Date.now();
  req.requestId = requestId;
  console.log(`[${requestId}] -> ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[${requestId}] <- ${res.statusCode} ${req.method} ${req.originalUrl} (${durationMs}ms)`,
    );
  });

  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
  });
});

app.get("/search", async (req, res) => {
  const startedAt = Date.now();
  const query = String(req.query.q ?? "").trim();
  const limit = Math.max(1, Number.parseInt(req.query.limit ?? "5", 10) || 5);
  const key = String(req.query.key ?? "");
  const requestId = req.requestId ?? "unknown";

  if (!query) {
    console.log(`[${requestId}] Missing parameter q`);
    res.status(400).json({
      success: false,
      error: "Parameter q is required.",
    });
    return;
  }

  if (apiKey && key !== apiKey) {
    console.log(`[${requestId}] Invalid API key`);
    res.status(401).json({
      success: false,
      error: "Invalid API key.",
    });
    return;
  }

  try {
    console.log(`[${requestId}] Scrape start: q=\"${query}\" limit=${limit}`);
    const results = await scrapeGoogleMaps(query, limit, requestId);
    console.log(`[${requestId}] Scrape done: results=${results.length}`);
    res.json({
      success: true,
      query,
      durationMs: Date.now() - startedAt,
      resultsCount: results.length,
      results,
    });
  } catch (error) {
    console.error(`[${requestId}] Scrape error: ${error?.message ?? error}`);
    res.status(500).json({
      success: false,
      error: error?.message ?? "Scraping failed.",
    });
  }
});

async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } finally {
    browserPromise = null;
    browserRef = null;
  }
}

export { app, closeBrowser, scrapeGoogleMaps };
export default app;
