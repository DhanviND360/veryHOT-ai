export type SourceMetadata = {
  provider: string;
  url: string;
  fetched_at: string | null;
  freshness_seconds: number | null;
};

export type CurrentConditions = {
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  apparent_temperature_c: number | null;
  wind_speed_kmh: number | null;
  precipitation_mm: number | null;
  timestamp: string | null;
};

export type HourlyForecast = CurrentConditions & { timestamp: string };

export type OutlookResponse = {
  location: { latitude: number; longitude: number; display_name: string };
  current: CurrentConditions | null;
  hourly: HourlyForecast[];
  daily: Array<Record<string, string | number | null>>;
  heat_assessment: {
    level: "unavailable" | "routine" | "elevated" | "high";
    methodology: string;
    explanation: string;
    contributing_values: Record<string, number | null>;
    limitations: string[];
    guidance: string[];
  };
  official_warning: {
    status: "verified" | "unavailable" | "error";
    details: Array<Record<string, unknown>>;
    issued_at: string | null;
    valid_until: string | null;
    source_name: string;
    source_url: string;
  };
  precautions: string[];
  sources: SourceMetadata[];
  errors: Array<{ code: string; message: string; source: string | null }>;
};

export type WaterLocation = {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  verification_status: string;
  last_verified_at: string | null;
};

export type WaterLocationsResponse = {
  locations: WaterLocation[];
  availability_status: "available" | "unavailable";
  source: SourceMetadata;
  last_verified_at: string | null;
};

export type GeocodeResult = {
  lat: string;
  lon: string;
  display_name: string;
  place_id: number;
};
