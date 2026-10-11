import type { ReactNode } from "react";
import type { OutlookResponse, WaterLocationsResponse } from "@/lib/types";

type Props = {
  children: ReactNode;
  outlook: OutlookResponse | null;
  water: WaterLocationsResponse | null;
  loading: boolean;
  errors: { outlook?: string; water?: string };
};

const value = (input: number | null | undefined, suffix = "") => input == null || !Number.isFinite(input) ? "Not returned" : `${Math.round(input)}${suffix}`;
const time = (input: string | null | undefined) => {
  if (!input || !Number.isFinite(new Date(input).getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(input));
};
const dateTime = (input: string | null | undefined) => {
  if (!input || !Number.isFinite(new Date(input).getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(input));
};

function HeatIllustration({ outlook }: { outlook: OutlookResponse | null }) {
  const current = outlook?.current;
  return (
    <div className="hero-art" aria-label="Editorial illustration of Hyderabad with a small sun and abstract warm map textures">
      <div className="hero-art__map" aria-hidden="true">
        <svg viewBox="0 0 620 440" role="presentation">
          <path className="hero-art__land" d="M75 62 174 38l41 26 99-9 42 34 101-3 89 59-18 65 31 45-45 64-78 9-34 54-85-15-69 28-64-42-92 5-34-67-49-42 29-80-21-52Z" />
          <g className="hero-art__roads">
            <path d="m88 101 89 42 64-27 76 48 86-21 112 44" /><path d="m81 181 87-9 45 48 75-8 56 57 91-12 77 48" />
            <path d="m122 67 29 87-22 66 61 57-13 80" /><path d="m226 53-10 94 41 55-7 78 61 48-8 68" />
            <path d="m349 77-32 84 33 72-29 71 50 71" /><path d="m460 100-57 61 14 68-46 63 36 59" />
            <path d="m87 246 99 15 75 61 105-8 99 39" /><path d="m177 142 11 52 69-7 51-47 41 21 54-1" />
          </g>
          <g className="hero-art__thermal" aria-hidden="true">
            <ellipse cx="209" cy="166" rx="52" ry="32" /><ellipse cx="347" cy="220" rx="61" ry="43" />
            <ellipse cx="444" cy="143" rx="37" ry="26" /><ellipse cx="284" cy="307" rx="43" ry="31" />
          </g>
          <g className="hero-art__labels"><text x="243" y="221">HYDERABAD</text><text x="95" y="307">FIELD NOTE · ILLUSTRATION</text></g>
        </svg>
        <span className="hero-art__stamp">NOT LIVE HEAT DATA</span>
      </div>
      <div className="hero-art__sun" aria-hidden="true"><i /><i /><b /><em /><em /></div>
      <div className="hero-art__annotation hero-art__annotation--one">heat has a local shape ↗</div>
      <div className="hero-art__annotation hero-art__annotation--two">a little more context, please</div>
      <div className="hero-art__live-note">
        <span>LIVE FEELS-LIKE</span>
        <strong>{current?.apparent_temperature_c == null ? "—" : `${Math.round(current.apparent_temperature_c)}°`}</strong>
        <small>{current?.apparent_temperature_c == null ? "Waiting for a returned observation" : "From the current API response"}</small>
      </div>
    </div>
  );
}

export default function LandingPage({ children, outlook, water, loading, errors }: Props) {
  const sources = outlook?.sources ?? [];
  const weatherSource = sources.find((source) => /open-meteo/i.test(source.provider)) ?? sources[0];
  const fetched = sources.map((source) => source.fetched_at).filter((date): date is string => Boolean(date)).sort().at(-1);
  const apiState = loading ? "Updating" : !outlook && !water ? "Unavailable" : errors.outlook || errors.water || outlook?.official_warning.status === "unavailable" || water?.availability_status === "unavailable" ? "Partial" : "Connected";
  const received = [
    ...(outlook?.current ? ["Current weather"] : []),
    ...(outlook?.hourly.length ? [`${outlook.hourly.length} hourly values`] : []),
    ...(outlook?.heat_assessment ? ["Heat assessment"] : []),
    ...(outlook?.official_warning ? [`IMD ${outlook.official_warning.status}`] : []),
    ...(water ? [`Water ${water.availability_status}`] : []),
  ];
  const hourly = outlook?.hourly.slice(0, 24) ?? [];
  const apparentHours = hourly.map((hour, index) => ({ hour, index })).filter(({ hour }) => hour.apparent_temperature_c != null);
  const peak = apparentHours.reduce<{ index: number; value: number } | null>((best, { hour, index }) => {
    const temperature = hour.apparent_temperature_c;
    if (temperature == null || (best && temperature <= best.value)) return best;
    return { index, value: temperature };
  }, null);
  const verifiedWaterCount = water?.locations.filter((location) => location.verification_status.trim().toLowerCase() === "verified").length ?? 0;
  const warning = outlook?.official_warning;
  const officialUrl = warning?.source_url || "https://mausam.imd.gov.in/";
  const waterUrl = water?.source.url || "https://www.ghmc.gov.in/";

  return (
    <div className="landing-page" id="top">
      <header className="site-header">
        <a className="site-brand" href="#top" aria-label="veryHOT.ai home"><span className="site-brand__mark">v</span><span>veryHOT<span>.</span>ai</span></a>
        <span className="site-pilot">HYDERABAD PILOT</span>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a><a href="#our-approach">Our approach</a><a href="#data-sources">Data &amp; sources</a>
        </nav>
        <aside className={`api-status api-status--${apiState.toLowerCase()}`} aria-live="polite" aria-label="Live API status">
          <div className="api-status__head"><span className="api-status__light" /><span>API STATUS</span><strong>{apiState}</strong></div>
          <p><b>Source</b> {weatherSource?.provider ?? (loading ? "Checking weather source…" : "Weather source unavailable")}</p>
          <p><b>Received</b> {received.length ? received.join(" · ") : loading ? "Waiting for API response" : "No response data"}</p>
          <small>{fetched ? `Updated ${dateTime(fetched)}` : "Source timestamp unavailable"}</small>
        </aside>
        <a className="site-header__cta" href="#heat-check">Check your heat <span aria-hidden="true">↘</span></a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__copy">
            <p className="landing-kicker"><span /> HYDERABAD, TAKE A BREATH</p>
            <h1 id="landing-title">The forecast is a number.<br /><em>The impact is personal.</em></h1>
            <p className="landing-hero__dek">Understand how heat and humidity could affect your day—and what you can do about it.</p>
            <div className="landing-hero__actions">
              <a className="primary-cta" href="#heat-check">Check my heat outlook <span aria-hidden="true">↘</span></a>
              <a className="text-cta" href="#how-it-works">How it works <span aria-hidden="true">↗</span></a>
            </div>
            <p className="landing-hero__disclaimer">A local forecast companion. Not an official warning or a medical tool.</p>
          </div>
          <HeatIllustration outlook={outlook} />
          <a className="hero-more-cta" href="#heat-check"><span><small>Want the full picture?</small><b>More of your outlook</b></span><i aria-hidden="true">↘</i></a>
          <span className="landing-hero__index">01 / A BETTER WAY TO READ THE HEAT</span>
        </section>

        {children}

        <section className="editorial-section why-section" id="our-approach" aria-labelledby="why-title">
          <div className="editorial-section__intro"><span className="section-index">01 — READ THE WEATHER</span><h2 id="why-title">Why it feels<br /><em>different.</em></h2><p>Three readings, one more useful picture of your day.</p></div>
          <div className="weather-notes">
            <article><span className="weather-notes__mark">01</span><h3>Air temperature</h3><strong>{value(outlook?.current?.temperature_c, "°C")}</strong><p>The temperature measured in the air, as returned by the weather provider.</p></article>
            <article><span className="weather-notes__mark">02</span><h3>Humidity</h3><strong>{value(outlook?.current?.relative_humidity_pct, "%")}</strong><p>Relative humidity adds context to how warm conditions may feel.</p></article>
            <article className="weather-notes__featured"><span className="weather-notes__mark">03</span><h3>Apparent temperature</h3><strong>{value(outlook?.current?.apparent_temperature_c, "°C")}</strong><p>The provider’s combined “feels-like” reading. Your own exposure can differ.</p></article>
          </div>
          <p className="editorial-caveat">The veryHOT.ai assessment is deterministic and supplementary. It is not an official IMD warning, a medical diagnosis, or a guarantee of safety.</p>
        </section>

        <section className="editorial-section plan-section" id="plan-your-day" aria-labelledby="plan-title">
          <div className="editorial-section__intro"><span className="section-index">02 — LOOK AHEAD</span><h2 id="plan-title">Plan your<br /><em>day.</em></h2><p>Use the returned hourly forecast to spot when the feels-like reading reaches its daily peak.</p></div>
          <div className="plan-content">
            {errors.outlook ? <p className="section-empty" role="status">The hourly outlook is unavailable. Refresh the live heat check to try again.</p> : hourly.length ? <>
              <div className="plan-timeline" aria-label="Returned hourly apparent temperature forecast">
                {hourly.map((hour, index) => <div className={`plan-hour ${peak?.index === index ? "is-peak" : ""}`} key={`${hour.timestamp}-${index}`} title={peak?.index === index ? "Highest apparent-temperature reading returned" : undefined}>
                  <time dateTime={hour.timestamp}>{time(hour.timestamp) ?? "—"}</time>
                  <b>{value(hour.apparent_temperature_c, "°")}</b>
                  <small>{value(hour.relative_humidity_pct, "% RH")}</small>
                  {peak?.index === index && <i>returned peak</i>}
                </div>)}
              </div>
              <p className="plan-note">The highlighted point is the highest apparent temperature in the returned hours. It is a forecast comparison, not a safe/unsafe boundary. {outlook?.heat_assessment.guidance[0] ?? "No practical precaution was returned with this outlook."}</p>
              {weatherSource && <a className="source-inline" href={weatherSource.url} target="_blank" rel="noreferrer">Hourly data: {weatherSource.provider} ↗</a>}
            </> : <p className="section-empty">{loading ? "Loading the live hourly forecast…" : "No hourly forecast values were returned."}</p>}
          </div>
        </section>

        <section className="editorial-section people-section" aria-labelledby="people-title">
          <div className="editorial-section__intro"><span className="section-index">03 — MAKE A PLAN</span><h2 id="people-title">A little context<br /><em>goes a long way.</em></h2></div>
          <div className="people-notes">
            <article><span>For the commute</span><p>Check the hourly outlook before choosing when to walk, wait, or travel.</p><b>01 / OUTDOOR COMMUTERS</b></article>
            <article><span>For the workday</span><p>Use changing conditions to plan shaded breaks and pace strenuous outdoor tasks.</p><b>02 / OUTDOOR WORKERS</b></article>
            <article><span>For your people</span><p>Check conditions before heading out with children or older family members.</p><b>03 / CAREGIVERS</b></article>
          </div>
          <p className="editorial-caveat">These are planning ideas, not personalized medical advice. Follow official guidance and consider individual needs.</p>
        </section>

        <section className="editorial-section method-section" id="how-it-works" aria-labelledby="method-title">
          <div className="editorial-section__intro"><span className="section-index">04 — FOLLOW THE SIGNAL</span><h2 id="method-title">How it<br /><em>works.</em></h2><p>From a place on the map to guidance you can use.</p></div>
          <div className="method-content">
            <div className="method-flow" aria-label="Location to weather source to heat assessment to guidance">
              <div><small>01</small><b>Your location</b></div><i aria-hidden="true">→</i>
              <div><small>02</small><b>{weatherSource?.provider ?? "Weather forecast"}</b></div><i aria-hidden="true">→</i>
              <div><small>03</small><b>veryHOT.ai assessment</b></div><i aria-hidden="true">→</i>
              <div><small>04</small><b>Practical guidance</b></div>
            </div>
            <p>The backend runs on AWS Lambda and exposes its API through Amazon API Gateway. The assessment is a deterministic supplement to provider data.</p>
            <div className="method-links"><a href="https://github.com/DhanviND360/veryHOT-ai" target="_blank" rel="noreferrer">Explore the code ↗</a>{weatherSource && <a href={weatherSource.url} target="_blank" rel="noreferrer">{weatherSource.provider} documentation ↗</a>}</div>
          </div>
        </section>

        <section className="editorial-section trust-section" id="data-sources" aria-labelledby="trust-title">
          <div className="editorial-section__intro"><span className="section-index">05 — KNOW WHAT YOU’RE SEEING</span><h2 id="trust-title">Clear about<br /><em>what we know.</em></h2></div>
          <div className="trust-list">
            <article><span>PROVIDER FORECAST</span><p>{weatherSource ? `${weatherSource.provider} data, timestamped in the live response.` : loading ? "Waiting for the live weather response." : "Weather provider data was not returned."}</p></article>
            <article><span>VERYHOT.AI ASSESSMENT</span><p>{outlook?.heat_assessment.explanation ?? (loading ? "Waiting for the assessment response." : "No assessment was returned.")}</p></article>
            <article><span>OFFICIAL IMD WARNING</span><p>{warning?.status === "verified" ? warning.details.length ? `${warning.details.length} official detail${warning.details.length === 1 ? "" : "s"} returned by the feed.` : "Feed marked verified; no warning details returned." : warning?.status === "error" ? "Official feed reports an error." : warning?.status === "unavailable" ? "The backend reports the official feed unavailable." : loading ? "Waiting for warning status." : "Warning status not returned."}</p><a href={officialUrl} target="_blank" rel="noreferrer">Official IMD resources ↗</a></article>
            <article><span>VERIFIED WATER LOCATIONS</span><p>{water?.availability_status === "available" ? `${verifiedWaterCount} verified point${verifiedWaterCount === 1 ? "" : "s"} returned. Other submitted locations remain unverified.` : loading ? "Waiting for water-location status." : "The backend reports this dataset unavailable."}</p><a href={waterUrl} target="_blank" rel="noreferrer">GHMC source ↗</a></article>
          </div>
        </section>

        <section className="water-roadmap" aria-labelledby="water-roadmap-title">
          <div className="water-roadmap__stamp">NEXT ON THE MAP</div>
          <div><span className="section-index">06 — COOLING RESOURCES</span><h2 id="water-roadmap-title">Verified water points,<br />when the data is ready.</h2><p>{water?.availability_status === "available" ? `${verifiedWaterCount} verified public water location${verifiedWaterCount === 1 ? "" : "s"} currently returned by ${water.source.provider}.` : "Public drinking-water and cooling locations are not available in the connected dataset yet. We will show them here only when a reliable source is returned."}</p><a href={waterUrl} target="_blank" rel="noreferrer">Check the official source ↗</a></div>
          <span className="water-roadmap__index">A FUTURE FIELD NOTE / 07</span>
        </section>
      </main>

      <footer className="site-footer"><a className="site-brand" href="#top"><span className="site-brand__mark">v</span><span>veryHOT<span>.</span>ai</span></a><p>Built for a more heat-aware Hyderabad.</p><nav aria-label="Footer sources"><a href="https://github.com/DhanviND360/veryHOT-ai" target="_blank" rel="noreferrer">GitHub ↗</a>{weatherSource && <a href={weatherSource.url} target="_blank" rel="noreferrer">{weatherSource.provider} ↗</a>}<a href={officialUrl} target="_blank" rel="noreferrer">IMD ↗</a><a href={waterUrl} target="_blank" rel="noreferrer">GHMC ↗</a></nav><small>Forecasts describe returned provider data. The supplementary assessment has limitations and does not replace official warnings or personal judgment.</small></footer>
    </div>
  );
}
