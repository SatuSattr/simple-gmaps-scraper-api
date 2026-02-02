# simple-gmaps-scraper-api

Lightweight Google Maps scraper API built with Node.js, Express, and Puppeteer Extra (Stealth). It returns only **name**, **address**, **latitude**, **longitude**, and **mapsUrl**.

the background story of this project is originally comes from the not so detailed places point in [OpenStreetMap](https://www.openstreetmap.org/). but i remember i could just scrape the longitude/latitude coordinate of a certain location from Google and use that to place the pinpoint in OpenStreetMap. However, this project is not affiliated with OpenStreetMap, its purely my hobby projects, feel free to use for hobby purposes.

## Features

- Fast list-mode scraping (no clicking results)
- Human-like scrolling
- Randomized user agent per request
- Optional API key via `.env`
- Works on Windows (local Chrome/Edge/Brave) and serverless (Chromium via `@sparticuz/chromium`)

## Requirements

- Node.js 18+
- Windows: Chrome/Edge/Brave installed (auto-detected)

## Install

```bash
npm install
```

## Configure

Create a `.env` file:

```env
API_KEY=your_key
PORT=3000
```

`API_KEY` is optional. If set, requests must include `key=API_KEY`.

## Run

Development (with auto-reload):

```bash
npm run dev
```

Or plain Node:

```bash
node index.js
```

You should see a log like:

```
simple gmaps scraper api is live! Listening on port 3000. Try /search?q=coffee&limit=3
```

## Vercel Deploy (One Click Ready)

This project includes `vercel.json` and a serverless entry at `api/index.js`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/satusattr/simple-gmaps-scraper-api&env=API_KEY&envDescription=API%20Key%20for%20authentication&project-name=simple-gmaps-scraper-api)

Steps:

1. Import the repo into Vercel.

2. Set Environment Variables:
   - `API_KEY` (optional)
3. Deploy.

After deploy, the endpoint is:

```
https://<your-domain>/search?q=coffee&limit=3&key=API_KEY
```

## Vercel Hobby Plan Performance Notes

Vercel Functions default to running in the `iad1` region (Washington, D.C., USA) unless you change the region in your project settings or configuration. This can add latency when your users or target data are far from that region (e.g., Indonesia), so Hobby plan deployments may feel slower.

Below is a quick benchmark from Hobby plan testing (request time includes end-to-end scraping):

| Query             | Limit | Duration (ms) |
| ----------------- | ----- | ------------- |
| `cafe in jakarta` | 1     | 10,555        |
| `cafe in jakarta` | 2     | 5,276         |
| `cafe in jakarta` | 3     | 9,149         |
| `cafe in jakarta` | 5     | 6,365         |
| `cafe in jakarta` | 10    | 4,377         |
| `cafe in jakarta` | 20    | 9,291         |
| `cafe in jakarta` | 50    | 39,267        |

Notes:

- Results are non-linear (e.g., limit=10 is faster than limit=3) because cold starts, cache reuse, and Google Maps response time can vary per request.
- These numbers can vary by time of day, Google Maps throttling, and cold starts. Consider optimizing limits or upgrading if you need more consistent performance.

## API

### `GET /search`

Query parameters:

- `q` (required): search keyword
- `limit` (optional, default: 5): number of results
- `key` (optional): API key (required if `API_KEY` is set)

Example:

```
/search?q=cafe+di+kota+bogor&limit=3&key=your_key
```

Response:

```json
{
  "success": true,
  "query": "cafe di kota bogor",
  "durationMs": 3280,
  "resultsCount": 3,
  "results": [
    {
      "name": "Raindear Coffee & Kitchen",
      "address": "Jl. Bina Marga No.7, RT.04/RW.11",
      "latitude": -6.6034326,
      "longitude": 106.8102516,
      "mapsUrl": "https://www.google.com/maps/place/..."
    }
  ]
}
```

## Notes

- The scraper uses list view data when multiple results appear.
- Coordinates are extracted from the Maps URL.
- If Google blocks the request, try a different network or reduce request rate.
