# veryHOT.ai backend

Minimal FastAPI service for Hyderabad-focused weather and heat information. It exposes no frontend. Forecast data comes from Open-Meteo. The IMD and GHMC integrations intentionally return unavailable/empty results until reliable public access and a suitable public dataset are verified.

## Data source verification

- **Open-Meteo:** its official forecast documentation lists the requested current/hourly variables (temperature, relative humidity, apparent temperature, wind speed, precipitation) and daily extrema/sums. This implementation requests seven daily summaries and includes the next 24 usable hourly timestamps. The API response includes Open-Meteo source attribution. Follow the provider's current [terms and pricing](https://open-meteo.com/en/pricing) for commercial use and usage limits; configure a paid endpoint/key only if your use requires one.
- **IMD:** the [official API reference](https://api.imd.gov.in/public/api_reference.html) lists district warning endpoints and fields such as district, issue date/time, five warning days, and color codes. A direct unauthenticated request to the documented district warning endpoint returned HTTP 401. The public reference did not disclose an authentication method, and a Hyderabad district mapping was not verified. This build therefore returns `status: "unavailable"`, no warning details, and the official documentation link. The warning is never inferred from forecast data.
- **Water/cooling locations:** GHMC's public site was searched, but no credible, current, publicly accessible dataset with reuse terms was verified. `/api/v1/water-locations` therefore returns `locations: []` and `availability_status: "unavailable"`.

## Run locally

Python 3.12 is recommended.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app:app --reload
```

OpenAPI documentation is at `http://127.0.0.1:8000/docs`.

Or with Docker:

```powershell
docker build -t veryhot-api .
docker run --rm -p 8000:8000 -e CORS_ORIGINS=http://localhost:3000 veryhot-api
```

## Endpoints

- `GET /health` — liveness status.
- `GET /api/v1/outlook?lat=17.385&lon=78.486` — current model conditions, next 24 hourly values, available daily summaries, supplementary heuristic, IMD status, precautions, sources, and structured partial-data errors. Coordinates are validated against WGS84 ranges.
- `GET /api/v1/water-locations?lat=17.385&lon=78.486&radius_km=5` — empty, explicitly unavailable list until a verified source is available. Radius must be in `(0, 100]` km.

The heat assessment is deterministic and uses the provider's apparent temperature plus relative humidity. Its bands are explicitly app-defined communication bands, not medical or official IMD thresholds. It is not a safety guarantee. Missing required inputs yield `level: "unavailable"`.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `CORS_ORIGINS` | `*` | Comma-separated allowed browser origins. Set the production frontend origin(s). |
| `OPEN_METEO_BASE_URL` | Open-Meteo forecast URL | Override for a compatible endpoint/testing. No API secret is required by default. |
| `REQUEST_TIMEOUT_SECONDS` | `8` | Outbound HTTP timeout. |
| `CACHE_TTL_SECONDS` | `300` | In-process forecast cache lifetime; set to `0` to disable. |
| `CACHE_MAX_ENTRIES` | `128` | Maximum cached coordinate pairs per process. |
| `LOG_LEVEL` | `INFO` | Python logging level. |

Logs include upstream failure categories, not credentials or upstream payloads. The process-local cache is bounded and is not shared between Lambda execution environments.

## Test and live integration check

```powershell
python -m pip install -r requirements-dev.txt
pytest -q
```

Tests cover normalization, the 24-hour window, explicit unavailable IMD/water responses, coordinate validation, and partial/outage handling. A live Open-Meteo test is opt-in:

```powershell
$env:RUN_LIVE_OPEN_METEO = '1'
pytest -q tests/test_api.py::test_live_open_meteo_integration
```

The live test needs outbound HTTPS access. It is not a substitute for checking the public AWS URL after deployment.

## Deploy to AWS Lambda + Function URL

Requirements: AWS CLI v2 configured with credentials, AWS SAM CLI, and Docker (SAM's container build produces Linux-compatible dependencies). The template creates both a public HTTPS Lambda Function URL (`AuthType: NONE`) and an API Gateway HTTP API. The Function URL is the URL intended for the frontend. Restrict CORS to the deployed frontend domain before production deployment.

```powershell
sam validate --lint
sam build --use-container
sam deploy --guided
```

During guided deploy, choose a stack name (for example `veryhot-api`), the target AWS region, allow SAM to create the required IAM role, and save the answers for future deploys. Set `CorsOrigins` to your exact frontend origin(s), comma-separated. The stack output `FunctionUrl` is the public URL.

Subsequent deployments:

```powershell
sam build --use-container
sam deploy
```

Verify the deployed endpoint (replace the URL with the `FunctionUrl` stack output):

```powershell
$api = 'https://YOUR_FUNCTION_ID.lambda-url.YOUR_REGION.on.aws'
Invoke-RestMethod "$api/health"
Invoke-RestMethod "$api/api/v1/outlook?lat=17.385&lon=78.486" | ConvertTo-Json -Depth 12
Invoke-RestMethod "$api/api/v1/water-locations?lat=17.385&lon=78.486&radius_km=5" | ConvertTo-Json -Depth 8
```

The HTTP API event is also configured as a secondary entry path and is shown as a CloudFormation output.

## Sample responses

See [`samples/outlook.json`](samples/outlook.json) and [`samples/water-locations.json`](samples/water-locations.json). These are shape examples; their weather values are labeled illustrative and are not live observations.
