from __future__ import annotations

import pytest

import app as backend


def run_no_io(coroutine):
    """Drive endpoint coroutines that await only mocked, immediately-ready operations."""
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError("Unexpected I/O in an offline unit test")


def sample_forecast() -> dict:
    times = [f"2026-10-11T{hour:02d}:00" for hour in range(24)] + ["2026-10-12T00:00"]
    return {
        "current": {"time": times[0], "temperature_2m": 36.0, "relative_humidity_2m": 72,
                    "apparent_temperature": 42.0, "wind_speed_10m": 9.0, "precipitation": 0.0},
        "hourly": {"time": times, "temperature_2m": [36.0] * len(times),
                   "relative_humidity_2m": [72] * len(times), "apparent_temperature": [42.0] * len(times),
                   "wind_speed_10m": [9.0] * len(times), "precipitation": [0.0] * len(times)},
        "daily": {"time": ["2026-10-11", "2026-10-12"], "temperature_2m_max": [37, 36],
                  "temperature_2m_min": [25, 24], "apparent_temperature_max": [42, 40],
                  "apparent_temperature_min": [28, 27], "precipitation_sum": [0, 1]},
    }


def test_health_and_contract(monkeypatch) -> None:
    async def fake_fetch(lat, lon):
        return sample_forecast(), False, None
    monkeypatch.setattr(backend, "_fetch_forecast", fake_fetch)
    assert run_no_io(backend.health())["status"] == "ok"
    response = run_no_io(backend.outlook(lat=17.385, lon=78.486))
    assert set(response.model_dump()) == {"location", "current", "hourly", "daily", "heat_assessment", "official_warning", "precautions", "sources", "errors"}


def test_weather_normalization_and_24_hours(monkeypatch) -> None:
    async def fake_fetch(lat, lon):
        return sample_forecast(), False, None
    monkeypatch.setattr(backend, "_fetch_forecast", fake_fetch)
    data = run_no_io(backend.outlook(lat=17.385, lon=78.486)).model_dump()
    assert len(data["hourly"]) == 24
    assert all(item["timestamp"].endswith("+05:30") and item["temperature_c"] == 36 for item in data["hourly"])
    assert data["current"]["relative_humidity_pct"] == 72
    assert data["daily"][0]["temperature_max_c"] == 37
    assert data["heat_assessment"]["level"] == "high"


def test_missing_imd_and_water_data_are_explicit(monkeypatch) -> None:
    async def fake_fetch(lat, lon):
        return sample_forecast(), False, None
    monkeypatch.setattr(backend, "_fetch_forecast", fake_fetch)
    outlook = run_no_io(backend.outlook(lat=17.385, lon=78.486)).model_dump()
    assert outlook["official_warning"]["status"] == "unavailable"
    assert outlook["official_warning"]["details"] == []
    water = run_no_io(backend.water_locations(lat=17.385, lon=78.486, radius_km=5)).model_dump()
    assert water["availability_status"] == "unavailable"
    assert water["locations"] == []


def test_invalid_coordinates_rejected() -> None:
    spec = backend.app.openapi()
    outlook = {p["name"]: p["schema"] for p in spec["paths"]["/api/v1/outlook"]["get"]["parameters"]}
    water = {p["name"]: p["schema"] for p in spec["paths"]["/api/v1/water-locations"]["get"]["parameters"]}
    assert outlook["lat"]["minimum"] == -90 and outlook["lat"]["maximum"] == 90
    assert outlook["lon"]["minimum"] == -180 and outlook["lon"]["maximum"] == 180
    assert water["radius_km"]["exclusiveMinimum"] == 0 and water["radius_km"]["maximum"] == 100


def test_weather_outage_returns_partial_contract(monkeypatch) -> None:
    async def broken_fetch(lat, lon):
        return None, False, "ConnectError"
    monkeypatch.setattr(backend, "_fetch_forecast", broken_fetch)
    data = run_no_io(backend.outlook(lat=17.385, lon=78.486)).model_dump()
    assert data["current"] is None
    assert data["hourly"] == [] and data["daily"] == []
    assert data["heat_assessment"]["level"] == "unavailable"
    assert data["errors"][0]["code"] == "weather_unavailable"
    assert data["official_warning"]["status"] == "unavailable"


def test_malformed_partial_weather_does_not_crash(monkeypatch) -> None:
    async def partial_fetch(lat, lon):
        return {"current": {"time": "not-a-number", "temperature_2m": "bad"}, "hourly": {"time": ["bad"], "temperature_2m": []}, "daily": {}}, False, None
    monkeypatch.setattr(backend, "_fetch_forecast", partial_fetch)
    response = run_no_io(backend.outlook(lat=17.385, lon=78.486)).model_dump()
    assert response["hourly"] == []
    assert response["current"]["temperature_c"] is None


def test_live_open_meteo_integration() -> None:
    """Opt in with RUN_LIVE_OPEN_METEO=1 where outbound internet is available."""
    import os
    import pytest
    if os.getenv("RUN_LIVE_OPEN_METEO") != "1":
        pytest.skip("Set RUN_LIVE_OPEN_METEO=1 to make a real Open-Meteo request")
    data = run_no_io(backend.outlook(lat=17.385, lon=78.486)).model_dump()
    assert data["current"] is not None
    assert data["hourly"]
    assert data["hourly"][0]["timestamp"]
