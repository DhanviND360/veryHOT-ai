# veryHOT.ai frontend

Next.js map-first frontend for the deployed veryHOT.ai API. The interface reads weather, heat assessments, warning state, and verified water locations from the API at runtime. It does not ship sample readings, map markers, heat zones, or fallback forecast data.

## Local development

```powershell
npm install
npm run dev
```

Set `VERYHOT_API_BASE_URL` in `frontend/.env.local` to the deployed API base URL before starting the app. Next.js route handlers proxy API requests so browser CORS configuration is not required and the upstream URL remains server-side. Environment files are excluded from Git.

To enable Groq topic selection for the grounded Sun companion, also set `GROQ_API_KEY` and `GROQ_MODEL=qwen/qwen3.8-27b`. Both are read only by the server route. Groq classifies the question; the displayed answer is assembled from facts returned by the weather and water APIs. If Groq is unavailable or not configured, a small local topic classifier keeps sourced answers available. The browser never receives the key or direct Groq access.

The landing page pairs the live API status with an editorial Hyderabad heat illustration. Its warm map textures are explicitly marked as illustration and are not live heat measurements. **Check my heat outlook** and **More of your outlook** lead to the existing interactive map, forecast, water points, and safety guidance.

## Vercel

Import the repository into Vercel and set **Root Directory** to `frontend`. Add `VERYHOT_API_BASE_URL` under Project Settings → Environment Variables for Preview and Production; it is required for live weather and water data. Add `GROQ_API_KEY` and `GROQ_MODEL=qwen/qwen3.8-27b` to enable Groq topic selection for the Sun companion. Without the Groq variables, the companion uses its local topic classifier and still answers from live API facts. Redeploy after changing variables. No API secret is embedded in the client bundle.

The map uses the no-key OpenFreeMap bright style with OpenStreetMap attribution. Place search is proxied through the Next.js server to the OpenStreetMap Nominatim search service; its returned place names and coordinates are used only to center the map and request a new outlook.

## Data and availability behavior

- `/api/v1/outlook` and `/api/v1/water-locations` proxy the deployed API without caching.
- Verified water markers use a solid marker. Returned locations with any other `verification_status` use a dashed marker and remain labelled unverified until the backend marks them verified.
- An unavailable IMD feed or unavailable water dataset stays visibly unavailable. An empty API response is not converted into a claim that no warning or water point exists.
- When an upstream request fails, the relevant panel shows an error and a retry action where applicable.
- The Sun companion makes a server-side Groq call only to choose a topic from the current API response. Its visible answer is assembled from those exact facts and their reported sources.

## Commands

```powershell
npm run typecheck
npm run build
npm run start
```
