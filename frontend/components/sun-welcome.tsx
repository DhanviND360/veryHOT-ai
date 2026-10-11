import type { OutlookResponse } from "@/lib/types";

type Props = {
  outlook: OutlookResponse | null;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onMore: () => void;
};

const number = (value: number | null | undefined, suffix: string) =>
  value == null || !Number.isFinite(value) ? "Not returned" : `${Math.round(value)}${suffix}`;

const timestamp = (value: string | null | undefined) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
};

export default function SunWelcome({ outlook, loading, error, onRetry, onMore }: Props) {
  const current = outlook?.current;
  const assessment = outlook?.heat_assessment;
  const warning = outlook?.official_warning;
  const weatherSource = outlook?.sources.find((source) => /open-meteo/i.test(source.provider)) ?? outlook?.sources[0];
  const observationTime = timestamp(current?.timestamp);
  const fetchedTime = timestamp(weatherSource?.fetched_at);

  return (
    <main className="sun-entry">
      <header className="sun-entry__header">
        <a className="sun-entry__brand" href="#home" aria-label="veryHOT.ai home">
          <span className="sun-entry__brand-mark" aria-hidden="true">v</span>
          <span>veryHOT<span>.</span>ai</span>
        </a>
        <span className="sun-entry__place">HYDERABAD&nbsp; / &nbsp;HEAT OUTLOOK</span>
      </header>

      <section className="sun-entry__scene" aria-labelledby="sun-report-title">
        <div className="sun-entry__sun-stage">
          <div className="sun-entry__rays" aria-hidden="true" />
          <div className="sun-entry__sun" role="img" aria-label="A little animated orange sun">
            <span className="sun-entry__face" aria-hidden="true">
              <i /><i /><b />
              <em /><em />
            </span>
          </div>
          <span className="sun-entry__orbit sun-entry__orbit--one" aria-hidden="true" />
          <span className="sun-entry__orbit sun-entry__orbit--two" aria-hidden="true" />
        </div>

        <article className="sun-report" aria-live="polite">
          <div className="sun-report__topline">
            <span className="sun-report__signal"><i />{loading ? "CHECKING LIVE CONDITIONS" : error ? "LIVE DATA UNAVAILABLE" : "LIVE HYDERABAD OUTLOOK"}</span>
            {observationTime && <time dateTime={current?.timestamp ?? undefined}>{observationTime}</time>}
          </div>
          <h1 id="sun-report-title">{outlook?.location.display_name ?? "A little sunshine, with the facts."}</h1>

          {loading && <p className="sun-report__status" role="status">Fetching the latest outlook from veryHOT.ai…</p>}
          {!loading && error && <div className="sun-report__error" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Try again</button></div>}
          {!loading && !error && outlook && <>
            <div className="sun-report__temperature">
              <strong>{number(current?.apparent_temperature_c, "°")}</strong>
              <span>feels like</span>
              <small>{number(current?.temperature_c, "°C")} air</small>
            </div>
            <div className="sun-report__conditions" aria-label="Current weather conditions">
              <span><small>HUMIDITY</small><b>{number(current?.relative_humidity_pct, "%")}</b></span>
              <span><small>WIND</small><b>{number(current?.wind_speed_kmh, " km/h")}</b></span>
            </div>
            <div className={`sun-report__assessment sun-report__assessment--${assessment?.level ?? "unavailable"}`}>
              <span className="sun-report__assessment-label"><i />VERYHOT.AI ASSESSMENT <b>{assessment?.level ?? "Unavailable"}</b></span>
              <p>{assessment?.explanation || "No heat assessment explanation was returned."}</p>
            </div>
            <div className="sun-report__warning">
              <span>OFFICIAL IMD</span>
              <p>{warning?.status === "verified"
                ? warning.details.length ? `${warning.details.length} official warning detail${warning.details.length === 1 ? "" : "s"} returned.` : "Feed verified; no warning details were returned."
                : warning?.status === "error" ? "The official feed returned an error."
                  : "The official warning feed is currently unavailable."}</p>
              {warning?.source_url && <a href={warning.source_url} target="_blank" rel="noreferrer">IMD source ↗</a>}
            </div>
            {assessment?.guidance[0] && <p className="sun-report__guidance"><span>FOR THIS OUTLOOK</span>{assessment.guidance[0]}</p>}
            <footer className="sun-report__source">
              {weatherSource ? <a href={weatherSource.url} target="_blank" rel="noreferrer">{weatherSource.provider} ↗</a> : <span>Weather source unavailable</span>}
              {weatherSource?.fetched_at && <span>Updated {fetchedTime ?? new Date(weatherSource.fetched_at).toLocaleString("en-IN")}</span>}
            </footer>
          </>}

          {!loading && !error && !outlook && <p className="sun-report__status">No live outlook was returned for this location.</p>}
          <button className="sun-report__more" type="button" onClick={onMore}>
            More <span aria-hidden="true">↗</span>
          </button>
        </article>
        <p className="sun-entry__note">A warm welcome. A clear read of the live data.</p>
      </section>

      <footer className="sun-entry__footer">veryHOT.ai <span>·</span> Hyderabad heat &amp; water intelligence</footer>
    </main>
  );
}
