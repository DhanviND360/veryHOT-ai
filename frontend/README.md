# veryHOT.ai frontend

Next.js map-first frontend for the deployed veryHOT.ai API. The interface reads weather, heat assessments, warning state, and verified water locations from the API at runtime. It does not ship sample readings, map markers, heat zones, or fallback forecast data.

## Local development

```powershell
npm install
npm run dev
```

Set `VERYHOT_API_BASE_URL` in `frontend/.env.local` to the deployed API base URL before starting the app. Next.js route handlers proxy API requests so browser CORS configuration is not required and the upstream URL remains server-side. Environment files are excluded from Git.

## Vercel

Import the repository into Vercel, set **Root Directory** to `frontend`, and add `VERYHOT_API_BASE_URL` under Project Settings → Environment Variables for Preview and Production. Redeploy after changing the variable. No API secret is embedded in the client bundle.

The map uses the no-key OpenFreeMap dark style with OpenStreetMap attribution. Place search is proxied through the Next.js server to the OpenStreetMap Nominatim search service; its returned place names and coordinates are used only to center the map and request a new outlook.

## Data and availability behavior

- `/api/v1/outlook` and `/api/v1/water-locations` proxy the deployed API without caching.
- Water markers are rendered only for returned locations whose `verification_status` is `verified`.
- An unavailable IMD feed or unavailable water dataset stays visibly unavailable. An empty API response is not converted into a claim that no warning or water point exists.
- When an upstream request fails, the relevant panel shows an error and a retry action where applicable.

## Commands

```powershell
npm run typecheck
npm run build
npm run start
```
