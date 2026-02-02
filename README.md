# simple-gmaps-scraper-api

Lightweight Google Maps scraper API built with Node.js, Express, and Puppeteer Extra (Stealth). It returns only **name**, **address**, **latitude**, **longitude**, and **mapsUrl**.

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

## Logging

Each request logs:

- Request ID
- Method & URL
- Selected User-Agent
- Status code and duration
