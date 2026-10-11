"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { GeocodeResult, OutlookResponse, SourceMetadata, WaterLocation, WaterLocationsResponse } from "@/lib/types";

const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
  loading: () => <div className="map-loading" role="status">Opening map…</div>,
});

type LoadError = { outlook?: string; water?: string };
const numberText = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const localTime = (value: string | null | undefined, options: Intl.DateTimeFormatOptions = {}) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", ...options }).format(date);
};
const dateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date) : null;
};
const warningSummary = (detail: Record<string, unknown>) => {
  const values = ["title", "headline", "severity", "level", "event", "message", "description"]
    .map((key) => detail[key])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .filter(Boolean);
  return [...new Set(values)].join(" · ") || "Official warning details returned";
};
const requestError = async (response: Response, label: string) => {
  const body = await response.json().catch(() => null);
  return body?.detail || body?.error || `${label} request failed (${response.status}).`;
};

export default function Dashboard() {
  const [outlook, setOutlook] = useState<OutlookResponse | null>(null);
  const [water, setWater] = useState<WaterLocationsResponse | null>(null);
  const [errors, setErrors] = useState<LoadError>({});
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [places, setPlaces] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<WaterLocation | null>(null);
  const [center, setCenter] = useState<[number, number]>([78.486, 17.385]);
  const [requestedLabel, setRequestedLabel] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);

  const loadLocation = useCallback(async (lat?: number, lon?: number, label?: string) => {
    setLoading(true);
    setErrors({});
    setSelected(null);
    setRequestedLabel(label ?? null);
    setOutlook(null);
    setWater(null);
    const params = new URLSearchParams();
    if (lat !== undefined && lon !== undefined) {
      params.set("lat", String(lat));
      params.set("lon", String(lon));
    }
    const suffix = params.toString() ? `?${params}` : "";
    const waterParams = new URLSearchParams(params);
    waterParams.set("radius_km", "5");
    const [outlookResult, waterResult] = await Promise.allSettled([
      fetch(`/api/v1/outlook${suffix}`, { cache: "no-store" }),
      fetch(`/api/v1/water-locations?${waterParams}`, { cache: "no-store" }),
    ]);
    const nextErrors: LoadError = {};
    if (outlookResult.status === "fulfilled" && outlookResult.value.ok) {
      try {
        const data = (await outlookResult.value.json()) as OutlookResponse;
        setOutlook(data);
        setCenter([data.location.longitude, data.location.latitude]);
      } catch {
        nextErrors.outlook = "The outlook service returned data the interface could not read.";
        setOutlook(null);
      }
    } else if (outlookResult.status === "fulfilled") {
      nextErrors.outlook = await requestError(outlookResult.value, "Outlook");
      setOutlook(null);
    } else {
      nextErrors.outlook = "The live outlook service could not be reached. Check your connection and retry.";
      setOutlook(null);
    }
    if (waterResult.status === "fulfilled" && waterResult.value.ok) {
      try {
        setWater((await waterResult.value.json()) as WaterLocationsResponse);
      } catch {
        nextErrors.water = "The water locations service returned data the interface could not read.";
        setWater(null);
      }
    } else if (waterResult.status === "fulfilled") {
      nextErrors.water = await requestError(waterResult.value, "Water locations");
      setWater(null);
    } else {
      nextErrors.water = "The live water locations service could not be reached.";
      setWater(null);
    }
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { void loadLocation(); }, [loadLocation]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setPlaces([]); setSearchError(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Place search is temporarily unavailable.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error(data.error || "Place search is temporarily unavailable.");
        setPlaces(data as GeocodeResult[]);
        setSearchError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setPlaces([]);
          setSearchError(error instanceof Error ? error.message : "Place search is temporarily unavailable.");
        }
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 1000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  const verifiedWater = useMemo(() => water?.locations.filter((item) => item.verification_status.trim().toLowerCase() === "verified") ?? [], [water]);
  const current = outlook?.current;
  const assessment = outlook?.heat_assessment;
  const warning = outlook?.official_warning;
  const weatherSource = outlook?.sources.find((source) => /open-meteo/i.test(source.provider)) ?? outlook?.sources[0];
  const timestamp = localTime(current?.timestamp, { weekday: "short" });

  function choosePlace(place: GeocodeResult) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setSearch(place.display_name.split(",").slice(0, 2).join(","));
    setCenter([lon, lat]);
    setPlaces([]);
    setPlaceOpen(false);
    void loadLocation(lat, lon, place.display_name);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (places[0]) choosePlace(places[0]);
  }

  function refreshLocation() {
    if (requestedLabel) void loadLocation(center[1], center[0], requestedLabel);
    else if (outlook) void loadLocation(outlook.location.latitude, outlook.location.longitude, outlook.location.display_name);
    else void loadLocation();
  }

  function useCurrentLocation() {
    setSearchError("");
    if (!navigator.geolocation) { setSearchError("Location access is not supported by this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => { setSearch("Current location"); setPlaces([]); setCenter([position.coords.longitude, position.coords.latitude]); void loadLocation(position.coords.latitude, position.coords.longitude, "Current location"); },
      () => setSearchError("Location permission was denied or the location could not be determined."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const sourceLine = (source: SourceMetadata | undefined) => source ? (
    <a href={source.url} target="_blank" rel="noreferrer" className="source-link">
      {source.provider}{source.fetched_at ? ` · updated ${dateTime(source.fetched_at)}` : " · no recent feed timestamp"}
    </a>
  ) : null;
  const locationTitle = outlook?.location.display_name === "Requested coordinates"
    ? requestedLabel ?? "Selected location"
    : outlook?.location.display_name ?? requestedLabel ?? (loading ? "Loading location…" : "Location unavailable");

  return (
    <main className="dashboard">
      <MapView center={center} locations={verifiedWater} selected={selected} onSelect={setSelected} />
      <header className="topbar">
        <a className="brand" href="#home" aria-label="veryHOT.ai home"><span className="brand-mark" aria-hidden="true">v</span><span>veryHOT<span className="brand-dot">.</span>ai</span></a>
        <form className="search-wrap" onSubmit={submitSearch} role="search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="place-search">Search a place</label>
          <input id="place-search" value={search} onChange={(event) => { setSearch(event.target.value); setPlaceOpen(true); }} onFocus={() => setPlaceOpen(true)} placeholder="Search Hyderabad or a place" autoComplete="off" />
          {searching && <span className="search-spinner" aria-label="Searching" />}
          <button className="locate-button" type="button" onClick={useCurrentLocation} aria-label="Use my current location" title="Use my location">◎</button>
          {placeOpen && (places.length > 0 || searchError) && <div className="search-results" role="listbox" aria-label="Place suggestions">
            {searchError ? <div className="search-empty" role="status">{searchError}</div> : places.map((place) => <button type="button" role="option" key={place.place_id} onClick={() => choosePlace(place)}>{place.display_name}</button>)}
          </div>}
        </form>
        <button className="refresh-button" type="button" onClick={refreshLocation} disabled={loading} aria-label="Refresh live data" title="Refresh live data">↻</button>
      </header>

      <section className="heat-card" aria-labelledby="heat-title">
        <div className="eyebrow"><span className={`live-dot ${loading ? "is-loading" : ""}`} />{loading ? "UPDATING LIVE DATA" : errors.outlook ? "LIVE DATA UNAVAILABLE" : "CURRENT OUTLOOK"}</div>
        <div className="location-name" id="heat-title">{locationTitle}</div>
        <div className="temperature-row">
          <div className="temperature">{numberText(current?.apparent_temperature_c)}<span>°C</span></div>
          <div className="temperature-copy"><strong>Feels like</strong><span>{current?.temperature_c == null ? "Temperature unavailable" : `${numberText(current.temperature_c)}°C air`}</span></div>
        </div>
        <div className="assessment-line">
          <span className={`assessment-indicator assessment-${assessment?.level ?? "unavailable"}`} />
          <span>veryHOT.ai assessment</span>
          <b>{assessment?.level ? assessment.level.charAt(0).toUpperCase() + assessment.level.slice(1) : "Unavailable"}</b>
        </div>
        {assessment?.explanation && <p className="heat-explanation">{assessment.explanation}</p>}
        {errors.outlook && <div className="inline-error" role="alert">{errors.outlook}<button type="button" onClick={refreshLocation}>Retry</button></div>}
        {current && <div className="condition-row">
          <span><small>Air</small><b>{numberText(current.temperature_c)}°C</b></span>
          <span><small>Humidity</small><b>{numberText(current.relative_humidity_pct)}%</b></span>
          <span><small>Wind</small><b>{numberText(current.wind_speed_kmh)} km/h</b></span>
        </div>}
        <div className="official-warning">
          <span className="warning-symbol" aria-hidden="true">!</span>
          <div><strong>Official IMD warning</strong>
            {warning?.status === "verified" ? <span>{warning.details.length ? `${warning.details.length} warning detail${warning.details.length === 1 ? "" : "s"} returned` : "No warning details returned"}</span> : warning?.status === "error" ? <span>IMD feed returned an error</span> : errors.outlook ? <span>Warning status unavailable because the outlook request failed</span> : loading ? <span>Loading warning status</span> : <span>Currently unavailable from source</span>}
          </div>
          {warning?.source_url && <a href={warning.source_url} target="_blank" rel="noreferrer" aria-label="Open official IMD source">↗</a>}
        </div>
        {warning?.status === "verified" && warning.details.length > 0 && <div className="warning-details">{warning.details.map((detail, index) => <p key={index}>{warningSummary(detail)}</p>)}</div>}
        <div className="heat-footer">{timestamp ? `Observation ${timestamp}` : loading ? "Waiting for the latest observation" : "Observation time unavailable"}{weatherSource?.fetched_at ? <span> · Source fetched {dateTime(weatherSource.fetched_at)}</span> : null}</div>
      </section>

      {selected && <section className="detail-card" aria-live="polite" aria-label="Water point details">
        <button className="close-detail" type="button" onClick={() => setSelected(null)} aria-label="Close water point details">×</button>
        <div className="eyebrow verified-label"><span className="verified-dot" />VERIFIED WATER POINT</div>
        <h2>{selected.name}</h2>
        {selected.address && <p>{selected.address}</p>}
        <div className="detail-meta">Status: {selected.verification_status}{selected.last_verified_at ? ` · Verified ${dateTime(selected.last_verified_at) ?? selected.last_verified_at}` : " · Verification time not provided"}</div>
      </section>}

      <div className="map-legend" aria-live="polite">
        <span className="legend-dot" />{verifiedWater.length ? `${verifiedWater.length} verified water point${verifiedWater.length === 1 ? "" : "s"}` : errors.water || water?.availability_status === "unavailable" ? "Water point data unavailable" : "No verified water points returned"}
      </div>

      <section className={`bottom-panel ${panelOpen ? "is-open" : ""}`} aria-label="Forecast and safety guidance">
        <button className="panel-toggle" type="button" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen} aria-controls="panel-content">
          <span className="panel-grip" aria-hidden="true" />
          <span className="panel-toggle-text"><strong>Next hours</strong><small>{outlook?.hourly.length ? `${outlook.hourly.length} hourly outlook points` : loading ? "Loading forecast" : "Forecast unavailable"}</small></span>
          <span className="panel-peek">{outlook?.hourly[0]?.apparent_temperature_c == null ? "—" : `${numberText(outlook.hourly[0].apparent_temperature_c)}°`} <i aria-hidden="true">{panelOpen ? "⌄" : "⌃"}</i></span>
        </button>
        <div className="panel-content" id="panel-content" aria-hidden={!panelOpen}>
          <div className="panel-columns">
            <div className="forecast-section">
              <div className="section-heading"><div><span className="eyebrow">HOURLY OUTLOOK</span><p>{weatherSource ? sourceLine(weatherSource) : "Values appear when the weather source responds."}</p></div></div>
              {errors.outlook ? <p className="empty-copy">Hourly outlook could not be loaded.</p> : outlook?.hourly.length ? <div className="hour-grid">{outlook.hourly.slice(0, 12).map((hour, index) => <div className="hour-cell" key={`${hour.timestamp}-${index}`}><span>{localTime(hour.timestamp) ?? "—"}</span><b>{numberText(hour.apparent_temperature_c)}°</b><small>{numberText(hour.temperature_c)}° air</small></div>)}</div> : <p className="empty-copy">{loading ? "Loading live forecast…" : "No hourly forecast was returned."}</p>}
            </div>
            <div className="guidance-section">
              <div className="section-heading"><div><span className="eyebrow">SAFETY GUIDANCE</span><p>veryHOT.ai assessment</p></div></div>
              {errors.outlook ? <p className="empty-copy">Guidance is unavailable while the outlook service is offline.</p> : assessment?.guidance.length ? <ul>{assessment.guidance.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="empty-copy">No guidance was returned for this location.</p>}
              {assessment?.methodology && <details><summary>About this assessment</summary><p>{assessment.methodology}</p>{assessment.limitations.map((item, index) => <p key={index} className="limitation">{item}</p>)}</details>}
            </div>
          </div>
          <div className="panel-sources">
            <span>DATA SOURCES</span>
            <div>{outlook?.sources.length ? outlook.sources.map((source, index) => <span key={`${source.provider}-${index}`}>{sourceLine(source)}</span>) : <span className="empty-copy">Source details will appear with the response.</span>}</div>
            {water?.availability_status === "unavailable" && <p className="water-empty">Verified water location data is currently unavailable from {water.source.provider}.</p>}
            {errors.water && <p className="inline-error" role="alert">{errors.water}</p>}
            {outlook?.errors.map((error, index) => <p className="inline-error" role="status" key={`${error.code}-${index}`}>{error.source ? `${error.source}: ` : ""}{error.message}</p>)}
          </div>
        </div>
      </section>

      <div className="map-credit">Map data © OpenStreetMap · Geocoding © OpenStreetMap contributors</div>
    </main>
  );
}
