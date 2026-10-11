"""veryHOT.ai public weather API."""

from __future__ import annotations

import logging
import math
import os
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

APP_VERSION = "1.0.0"
OPEN_METEO_URL = os.getenv("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast")
OPEN_METEO_DOCS = "https://open-meteo.com/en/docs"
IMD_DOCS = "https://api.imd.gov.in/public/api_reference.html"
GHMC_URL = "https://www.ghmc.gov.in/"
REQUEST_TIMEOUT = max(1.0, float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8")))
CACHE_TTL = max(0, int(os.getenv("CACHE_TTL_SECONDS", "300")))
CACHE_MAX_ENTRIES = max(1, int(os.getenv("CACHE_MAX_ENTRIES", "128")))

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("veryhot")


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WeatherValues(APIModel):
    temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    apparent_temperature_c: float | None = None
    wind_speed_kmh: float | None = None
    precipitation_mm: float | None = None


class CurrentConditions(WeatherValues):
    timestamp: str | None = None


class HourlyForecast(WeatherValues):
    timestamp: str


class DailyForecast(APIModel):
    date: str
    temperature_max_c: float | None = None
    temperature_min_c: float | None = None
    apparent_temperature_max_c: float | None = None
    apparent_temperature_min_c: float | None = None
    precipitation_sum_mm: float | None = None


class SourceMetadata(APIModel):
    provider: str
    url: str
    fetched_at: str | None = None
    freshness_seconds: int | None = None


class APIError(APIModel):
    code: str
    message: str
    source: str | None = None


class OfficialWarning(APIModel):
    status: Literal["verified", "unavailable", "error"]
    details: list[dict[str, Any]] = Field(default_factory=list)
    issued_at: str | None = None
    valid_until: str | None = None
    source_name: str
    source_url: str


class HeatAssessment(APIModel):
    level: Literal["unavailable", "routine", "elevated", "high"]
    methodology: str
    explanation: str
    contributing_values: dict[str, float | None]
    limitations: list[str]
    guidance: list[str]


class Location(APIModel):
    latitude: float
    longitude: float
    display_name: str


class OutlookResponse(APIModel):
    location: Location
    current: CurrentConditions | None
    hourly: list[HourlyForecast]
    daily: list[DailyForecast]
    heat_assessment: HeatAssessment
    official_warning: OfficialWarning
    precautions: list[str]
    sources: list[SourceMetadata]
    errors: list[APIError]


class WaterLocation(APIModel):
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    verification_status: str
    last_verified_at: str | None = None


class WaterLocationsResponse(APIModel):
    locations: list[WaterLocation]
    availability_status: Literal["available", "unavailable"]
    source: SourceMetadata
    last_verified_at: str | None


_cache: OrderedDict[tuple[float, float], tuple[float, dict[str, Any]]] = OrderedDict()
_cache_lock = threading.Lock()
_WEATHER_KEYS = {
    "temperature_2m": "temperature_c",
    "relative_humidity_2m": "relative_humidity_pct",
    "apparent_temperature": "apparent_temperature_c",
    "wind_speed_10m": "wind_speed_kmh",
    "precipitation": "precipitation_mm",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None = None) -> str:
    return (dt or _now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def _provider_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("Asia/Kolkata"))
    return parsed.isoformat(timespec="minutes")


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _cached_forecast(key: tuple[float, float]) -> dict[str, Any] | None:
    if CACHE_TTL == 0:
        return None
    now = time.monotonic()
    with _cache_lock:
        item = _cache.get(key)
        if item is None:
            return None
        expires_at, payload = item
        if expires_at <= now:
            del _cache[key]
            return None
        _cache.move_to_end(key)
        return payload


def _store_forecast(key: tuple[float, float], payload: dict[str, Any]) -> None:
    if CACHE_TTL == 0:
        return
    with _cache_lock:
        _cache[key] = (time.monotonic() + CACHE_TTL, payload)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


async def _fetch_forecast(lat: float, lon: float) -> tuple[dict[str, Any] | None, bool, str | None]:
    key = (round(lat, 4), round(lon, 4))
    cached = _cached_forecast(key)
    if cached is not None:
        return cached, True, None

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join(_WEATHER_KEYS),
        "hourly": ",".join(_WEATHER_KEYS),
        "daily": "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum",
        "forecast_days": 7,
        "timezone": "Asia/Kolkata",
        "timeformat": "iso8601",
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        payload["_veryhot_fetched_at"] = _iso()
        payload["_veryhot_fetched_monotonic"] = time.monotonic()
        _store_forecast(key, payload)
        return payload, False, None
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("weather_upstream_failure", extra={"upstream": "open-meteo", "error_type": type(exc).__name__})
        return None, False, type(exc).__name__


def _normalize_weather(group: dict[str, Any], index: int) -> dict[str, float | None]:
    return {target: _number(group.get(source, [])[index] if isinstance(group.get(source), list) and index < len(group[source]) else None)
            for source, target in _WEATHER_KEYS.items()}


def _parse_weather(payload: dict[str, Any], cached: bool) -> tuple[CurrentConditions | None, list[HourlyForecast], list[DailyForecast], list[APIError], str | None, int | None]:
    errors: list[APIError] = []
    fetched_at = payload.get("_veryhot_fetched_at")
    fetched_mono = payload.get("_veryhot_fetched_monotonic")
    freshness = max(0, int(time.monotonic() - fetched_mono)) if isinstance(fetched_mono, (int, float)) else None
    current_raw = payload.get("current")
    current: CurrentConditions | None = None
    if isinstance(current_raw, dict) and current_raw.get("time"):
        values = {target: _number(current_raw.get(source)) for source, target in _WEATHER_KEYS.items()}
        current = CurrentConditions(timestamp=_provider_timestamp(current_raw["time"]), **values)
        missing = [key for key, value in values.items() if value is None]
        if missing:
            errors.append(APIError(code="weather_current_partial", message=f"Current weather values were missing or malformed: {', '.join(missing)}.", source="Open-Meteo"))
    else:
        errors.append(APIError(code="weather_current_missing", message="Current weather fields were missing or malformed.", source="Open-Meteo"))

    hourly_data = payload.get("hourly")
    hourly: list[HourlyForecast] = []
    times = hourly_data.get("time") if isinstance(hourly_data, dict) else None
    if isinstance(times, list):
        current_time = None
        try:
            current_time = datetime.fromisoformat(str(current_raw["time"])) if isinstance(current_raw, dict) else None
        except (KeyError, ValueError):
            pass
        selected = []
        for i, stamp in enumerate(times):
            try:
                parsed = datetime.fromisoformat(str(stamp))
            except ValueError:
                continue
            if current_time is None or parsed >= current_time:
                selected.append((i, stamp))
        for index, stamp in selected[:24]:
            hourly.append(HourlyForecast(timestamp=_provider_timestamp(stamp), **_normalize_weather(hourly_data, index)))
        if any(any(getattr(item, field) is None for field in _WEATHER_KEYS.values()) for item in hourly):
            errors.append(APIError(code="weather_hourly_partial_fields", message="Some hourly weather values were missing or malformed.", source="Open-Meteo"))
    if not hourly:
        errors.append(APIError(code="weather_hourly_missing", message="No usable hourly forecast values were returned.", source="Open-Meteo"))
    elif len(hourly) < 24:
        errors.append(APIError(code="weather_hourly_partial", message=f"Only {len(hourly)} usable hourly forecast values were returned.", source="Open-Meteo"))

    daily_data = payload.get("daily")
    daily: list[DailyForecast] = []
    daily_times = daily_data.get("time") if isinstance(daily_data, dict) else None
    if isinstance(daily_times, list):
        fields = {
            "temperature_2m_max": "temperature_max_c", "temperature_2m_min": "temperature_min_c",
            "apparent_temperature_max": "apparent_temperature_max_c", "apparent_temperature_min": "apparent_temperature_min_c",
            "precipitation_sum": "precipitation_sum_mm",
        }
        for i, day in enumerate(daily_times):
            vals = {target: _number(daily_data.get(source, [])[i] if isinstance(daily_data.get(source), list) and i < len(daily_data[source]) else None)
                    for source, target in fields.items()}
            daily.append(DailyForecast(date=str(day), **vals))
        if any(value is None for item in daily for value in item.model_dump(exclude={"date"}).values()):
            errors.append(APIError(code="weather_daily_partial_fields", message="Some daily summary values were missing or malformed.", source="Open-Meteo"))
    if not daily:
        errors.append(APIError(code="weather_daily_missing", message="No daily summary values were returned.", source="Open-Meteo"))
    return current, hourly, daily, errors, fetched_at, freshness


def _assess(current: CurrentConditions | None) -> HeatAssessment:
    limitations = ["This is a supplementary, non-medical heuristic and is not an official warning or a safety guarantee.",
                   "Open-Meteo apparent temperature is a model estimate; shade, direct sun, local surfaces, health, age, and activity are not represented."]
    guidance = ["Drink water regularly, seek shade, and reduce strenuous outdoor activity during hot periods.",
                "Check official IMD updates and seek help if someone shows signs of heat illness."]
    if current is None or current.apparent_temperature_c is None or current.relative_humidity_pct is None:
        return HeatAssessment(level="unavailable", methodology="Requires apparent temperature and relative humidity from the weather provider.",
            explanation="There is not enough verified weather input to assign an assessment level.",
            contributing_values={"temperature_c": current.temperature_c if current else None,
                                 "apparent_temperature_c": current.apparent_temperature_c if current else None,
                                 "relative_humidity_pct": current.relative_humidity_pct if current else None},
            limitations=limitations + ["Required inputs were missing; no level was inferred."], guidance=guidance)
    apparent = current.apparent_temperature_c
    humidity = current.relative_humidity_pct
    # App-defined communication bands only; not medical thresholds.
    level: Literal["routine", "elevated", "high"]
    if apparent >= 40 or (apparent >= 35 and humidity >= 70):
        level = "high"
    elif apparent >= 32 or (apparent >= 30 and humidity >= 70):
        level = "elevated"
    else:
        level = "routine"
    return HeatAssessment(level=level,
        methodology="Deterministic communication heuristic using provider apparent temperature and relative humidity. App-defined bands: elevated at apparent temperature >=32°C (or >=30°C with RH >=70%); high at >=40°C (or >=35°C with RH >=70%). These are not medical or official thresholds.",
        explanation=f"The provider reports apparent temperature {apparent:.1f}°C and relative humidity {humidity:.0f}%; the app heuristic assigns '{level}'.",
        contributing_values={"temperature_c": current.temperature_c, "apparent_temperature_c": apparent,
                             "relative_humidity_pct": humidity, "wind_speed_kmh": current.wind_speed_kmh},
        limitations=limitations, guidance=guidance)


def _precautions(assessment: HeatAssessment) -> list[str]:
    advice = ["Drink water regularly, seek shade, and reduce strenuous outdoor activity during hot periods.",
              "Check official IMD updates and seek help if someone shows signs of heat illness."]
    if assessment.level == "elevated":
        advice.insert(0, "Consider moving strenuous outdoor work to cooler hours and take regular shaded breaks.")
    elif assessment.level == "high":
        advice.insert(0, "Avoid strenuous outdoor activity during the hottest hours where possible; use a cool indoor place and check on vulnerable people.")
    elif assessment.level == "unavailable":
        advice.insert(0, "Weather inputs are unavailable; check a current local forecast before planning outdoor activity.")
    return advice


app = FastAPI(title="veryHOT.ai API", version=APP_VERSION,
              description="Hyderabad-focused heat and water intelligence API. Weather forecasts are provided by Open-Meteo; official warning and verified local cooling/water datasets are currently unavailable.")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_methods=["GET"], allow_headers=["*"])


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/", tags=["system"])
async def root() -> dict[str, Any]:
    return {
        "service": "veryHOT.ai",
        "version": APP_VERSION,
        "docs": "docs",
        "endpoints": ["health", "api/v1/outlook", "api/v1/water-locations"],
    }


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "veryHOT.ai", "version": APP_VERSION}


@app.get("/api/v1/outlook", response_model=OutlookResponse, tags=["weather"])
async def outlook(lat: float = Query(17.385, ge=-90, le=90), lon: float = Query(78.486, ge=-180, le=180)) -> OutlookResponse:
    payload, cached, fetch_error = await _fetch_forecast(lat, lon)
    errors: list[APIError] = []
    current = None
    hourly: list[HourlyForecast] = []
    daily: list[DailyForecast] = []
    fetched_at = None
    freshness = None
    if payload is None:
        errors.append(APIError(code="weather_unavailable", message="Open-Meteo could not be reached. Weather fields are omitted rather than substituted.", source="Open-Meteo"))
        if fetch_error:
            logger.info("weather_unavailable", extra={"error_type": fetch_error})
    else:
        current, hourly, daily, errors, fetched_at, freshness = _parse_weather(payload, cached)
    assessment = _assess(current)
    return OutlookResponse(
        location=Location(latitude=lat, longitude=lon, display_name="Hyderabad" if abs(lat - 17.385) < .01 and abs(lon - 78.486) < .01 else "Requested coordinates"),
        current=current, hourly=hourly, daily=daily, heat_assessment=assessment,
        official_warning=OfficialWarning(status="unavailable", details=[], source_name="India Meteorological Department",
            source_url=IMD_DOCS),
        precautions=_precautions(assessment),
        sources=[SourceMetadata(provider="Open-Meteo", url=OPEN_METEO_DOCS, fetched_at=fetched_at,
                                freshness_seconds=freshness),
                 SourceMetadata(provider="India Meteorological Department", url=IMD_DOCS),
                 SourceMetadata(provider="Greater Hyderabad Municipal Corporation", url=GHMC_URL)], errors=errors)


@app.get("/api/v1/water-locations", response_model=WaterLocationsResponse, tags=["water"])
async def water_locations(lat: float = Query(17.385, ge=-90, le=90), lon: float = Query(78.486, ge=-180, le=180),
                          radius_km: float = Query(5, gt=0, le=100)) -> WaterLocationsResponse:
    del lat, lon, radius_km  # No verified public dataset is available to query.
    return WaterLocationsResponse(locations=[], availability_status="unavailable",
        source=SourceMetadata(provider="GHMC / Telangana government datasets", url=GHMC_URL), last_verified_at=None)
