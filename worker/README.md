# VeloApo Strava Worker — Deployment Guide

Cloudflare Worker that handles Strava OAuth, token storage (KV), and activity fetching for the VeloTimer PWA.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)
- [Strava API app](https://www.strava.com/settings/api) — you need Client ID and Client Secret
- Node.js 18+

---

## Step-by-step deployment

### 1. Install Wrangler

```bash
cd worker
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

A browser window will open — authorise Wrangler.

### 3. Create KV namespaces

Create the production namespace:
```bash
npx wrangler kv:namespace create STRAVA_KV
```

Create the preview/dev namespace:
```bash
npx wrangler kv:namespace create STRAVA_KV --preview
```

Both commands print an `id`. Copy them into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "PASTE_PRODUCTION_ID_HERE"
preview_id = "PASTE_PREVIEW_ID_HERE"
```

### 4. Set secrets

These are never stored in code — Wrangler injects them at runtime.

```bash
npx wrangler secret put STRAVA_CLIENT_ID
```
*(paste your Strava Client ID when prompted)*

```bash
npx wrangler secret put STRAVA_CLIENT_SECRET
```
*(paste your Strava Client Secret when prompted)*

```bash
npx wrangler secret put PWA_ORIGIN
```
*(value: `https://dahor212.github.io` — no trailing slash)*

### 5. Deploy

```bash
npx wrangler deploy
```

### 6. Note your Worker URL

After deploy, Wrangler prints something like:

```
Published veloapo-strava (0.05 sec)
  https://veloapo-strava.YOUR_CF_SUBDOMAIN.workers.dev
```

Save that URL.

### 7. Configure Strava App callback domain

Go to [developers.strava.com](https://developers.strava.com) → **My API Application** → **Authorization Callback Domain**.

Set it to (no `https://`, no path):
```
veloapo-strava.YOUR_CF_SUBDOMAIN.workers.dev
```

### 8. Configure the PWA

Open `app.js` in the VeloTimer PWA and update:

```js
const STRAVA_WORKER_URL = 'https://veloapo-strava.YOUR_CF_SUBDOMAIN.workers.dev';
```

### 9. First connect

1. Open VeloTimer in your browser
2. Tap the hamburger menu → **Připojit Strava**
3. You will be redirected to Strava to authorise the app
4. After authorising, you return to VeloTimer with Strava connected

---

## Endpoints reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/auth/login` | Redirect to Strava OAuth |
| GET | `/auth/callback` | Handle OAuth callback, store tokens |
| GET | `/auth/status` | `{connected, athleteName}` |
| DELETE | `/auth/logout` | Clear all tokens from KV |
| GET | `/api/activities` | Fetch recent rides (auto-refreshes token) |
| OPTIONS | `*` | CORS preflight |

Query params for `/api/activities`:
- `per_page` — number of activities (default 40)
- `after` — Unix timestamp, only return activities after this time

---

## Notes

- Tokens are stored in Cloudflare KV — the client secret **never** reaches the browser.
- The worker auto-refreshes the access token when it expires within 5 minutes.
- Only `Ride` and `VirtualRide` activity types are returned.
- The free Cloudflare Workers plan supports 100,000 requests/day — more than enough for personal use.
