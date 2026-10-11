import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Outlook = {
  current: { temperature_c: number | null; apparent_temperature_c: number | null; relative_humidity_pct: number | null; wind_speed_kmh: number | null; timestamp: string | null } | null;
  hourly: Array<{ timestamp: string; temperature_c: number | null; apparent_temperature_c: number | null; relative_humidity_pct: number | null }>;
  heat_assessment: { level: string; explanation: string; guidance: string[]; limitations: string[] };
  official_warning: { status: string; details: Array<Record<string, unknown>>; source_name: string; source_url: string; issued_at: string | null; valid_until: string | null };
  precautions: string[];
  sources: Array<{ provider: string; url: string; fetched_at: string | null }>;
  errors: Array<{ code: string; message: string; source: string | null }>;
};

type Water = {
  locations: Array<{ name: string; verification_status: string; last_verified_at: string | null }>;
  availability_status: string;
  source: { provider: string; url: string; fetched_at: string | null };
  last_verified_at: string | null;
};

type Fact = { id: string; text: string; source: string };

function isCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function value(value: number | null, suffix: string) {
  return value == null ? "not returned" : `${value}${suffix}`;
}

function compactWarning(detail: Record<string, unknown>) {
  const fields = ["title", "headline", "severity", "level", "event", "message", "description"];
  const text = fields.map((key) => detail[key]).filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String).filter(Boolean);
  return [...new Set(text)].join(" · ");
}

function buildFacts(outlook: Outlook, water: Water): Fact[] {
  const facts: Fact[] = [];
  const source = outlook.sources.find((item) => /open-meteo/i.test(item.provider));
  if (outlook.current) {
    facts.push({
      id: "current-conditions",
      text: `Current provider observation: ${value(outlook.current.apparent_temperature_c, "°C")} apparent temperature, ${value(outlook.current.temperature_c, "°C")} air temperature, ${value(outlook.current.relative_humidity_pct, "%")} humidity, and ${value(outlook.current.wind_speed_kmh, " km/h")} wind${outlook.current.timestamp ? ` at ${outlook.current.timestamp}` : ""}.`,
      source: source?.provider ?? "Weather provider",
    });
  }
  facts.push({ id: "assessment", text: `veryHOT.ai supplementary assessment: ${outlook.heat_assessment.explanation}`, source: "veryHOT.ai assessment" });
  outlook.heat_assessment.guidance.forEach((item, index) => facts.push({ id: `guidance-${index}`, text: item, source: "veryHOT.ai assessment guidance" }));
  outlook.precautions.forEach((item, index) => facts.push({ id: `precaution-${index}`, text: item, source: "veryHOT.ai precautions" }));
  const hourlyWithHumidity = outlook.hourly.filter((hour) => hour.relative_humidity_pct != null);
  if (hourlyWithHumidity.length) {
    const peakHumidity = hourlyWithHumidity.reduce((best, hour) => (hour.relative_humidity_pct ?? -Infinity) > (best.relative_humidity_pct ?? -Infinity) ? hour : best);
    facts.push({ id: "peak-humidity", text: `Highest returned hourly humidity: ${value(peakHumidity.relative_humidity_pct, "%")} at ${peakHumidity.timestamp}, with ${value(peakHumidity.apparent_temperature_c, "°C")} apparent temperature.`, source: source?.provider ?? "Weather provider" });
  }
  const hourlyWithHeat = outlook.hourly.filter((hour) => hour.apparent_temperature_c != null);
  if (hourlyWithHeat.length) {
    const peakHeat = hourlyWithHeat.reduce((best, hour) => (hour.apparent_temperature_c ?? -Infinity) > (best.apparent_temperature_c ?? -Infinity) ? hour : best);
    facts.push({ id: "peak-heat", text: `Highest returned hourly apparent temperature: ${value(peakHeat.apparent_temperature_c, "°C")} at ${peakHeat.timestamp}, with ${value(peakHeat.relative_humidity_pct, "%")} humidity.`, source: source?.provider ?? "Weather provider" });
  }
  if (outlook.official_warning.status === "verified") {
    const detail = outlook.official_warning.details.map(compactWarning).filter(Boolean);
    facts.push({ id: "official-warning", text: detail.length ? `Official ${outlook.official_warning.source_name} warning details: ${detail.join(" | ")}` : `${outlook.official_warning.source_name} is marked verified, with no warning details returned.`, source: outlook.official_warning.source_name });
  } else {
    facts.push({ id: "official-warning", text: `Official ${outlook.official_warning.source_name} warning status: ${outlook.official_warning.status}.`, source: outlook.official_warning.source_name });
  }
  if (water.availability_status === "available") {
    const verified = water.locations.filter((item) => item.verification_status.trim().toLowerCase() === "verified");
    const unverified = water.locations.length - verified.length;
    facts.push({ id: "water", text: `${verified.length} verified water point${verified.length === 1 ? "" : "s"} and ${unverified} unverified water point${unverified === 1 ? "" : "s"} were returned by ${water.source.provider}.`, source: water.source.provider });
  } else {
    facts.push({ id: "water", text: `Water point data status: ${water.availability_status} from ${water.source.provider}.`, source: water.source.provider });
  }
  outlook.errors.forEach((item, index) => facts.push({ id: `data-note-${index}`, text: item.message, source: item.source ?? "veryHOT.ai" }));
  return facts;
}

function modelText(payload: unknown) {
  const data = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

function classifyQuestion(question: string): string {
  const text = question.toLowerCase();
  if (/\b(water|drinking|hydration|water point|tap|fountain)\b/.test(text)) return "water";
  if (/\b(warning|alert|imd|official)\b/.test(text)) return "official_warning";
  if (/\b(hour|hourly|later|forecast|today|tomorrow|peak|afternoon|next|change)\b/.test(text)) return "forecast";
  if (/\b(humid|humidity|moist|muggy)\b/.test(text)) return "humidity";
  if (/\b(what should|how can|protect|safe|precaution|advice|guidance|vulnerable|child|elder|outdoor)\b/.test(text)) return "guidance";
  return "conditions";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.VERYHOT_API_BASE_URL?.replace(/\/$/, "");
  if (!apiKey) return NextResponse.json({ error: "The sun companion is not configured on this deployment." }, { status: 503 });
  if (!baseUrl) return NextResponse.json({ error: "The live outlook service is not configured." }, { status: 500 });

  const body = await request.json().catch(() => null) as { question?: unknown; lat?: unknown; lon?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 280) : "";
  const lat = body?.lat;
  const lon = body?.lon;
  if (!question || !isCoordinate(lat, -90, 90) || !isCoordinate(lon, -180, 180)) {
    return NextResponse.json({ error: "A short question and valid location are required." }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon) }).toString();
    const [outlookResponse, waterResponse] = await Promise.all([
      fetch(`${baseUrl}/api/v1/outlook?${query}`, { cache: "no-store", signal: AbortSignal.timeout(12000) }),
      fetch(`${baseUrl}/api/v1/water-locations?${query}&radius_km=5`, { cache: "no-store", signal: AbortSignal.timeout(12000) }),
    ]);
    if (!outlookResponse.ok || !waterResponse.ok) throw new Error("upstream");
    const [outlook, water] = [await outlookResponse.json() as Outlook, await waterResponse.json() as Water];
    const facts = buildFacts(outlook, water);
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const topicFactIds: Record<string, string[]> = {
      conditions: ["current-conditions", "assessment"],
      humidity: ["current-conditions", "peak-humidity", "guidance-0"],
      forecast: ["peak-heat", "peak-humidity", "guidance-0"],
      official_warning: ["official-warning"],
      water: ["water"],
      guidance: ["assessment", "guidance-0", "guidance-1", "precaution-0", "precaution-1"],
    };
    let topic = classifyQuestion(question);
    try {
      const gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Classify the user's question for a grounded Hyderabad heat companion. Return only strict JSON with one topic. Allowed topics: conditions, humidity, forecast, official_warning, water, guidance. Never answer the question, add facts, or infer health advice." }] },
          contents: [{ role: "user", parts: [{ text: question }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 120,
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: { topic: { type: "STRING", enum: Object.keys(topicFactIds) } }, required: ["topic"] },
          },
        }),
      });
      if (gemini.ok) {
        const rawSelection = modelText(await gemini.json());
        try {
          const json = rawSelection.match(/\{[\s\S]*\}/)?.[0] ?? rawSelection;
          const selection = JSON.parse(json) as { topic?: unknown };
          const selectedTopic = typeof selection.topic === "string" ? selection.topic : "";
          if (topicFactIds[selectedTopic]) topic = selectedTopic;
        } catch {
          const selectedTopic = Object.keys(topicFactIds).find((item) => rawSelection.includes(item));
          if (selectedTopic) topic = selectedTopic;
        }
      }
    } catch {
      // Gemini only chooses a topic. The local classifier keeps sourced facts available during outages.
    }
    const ids = topicFactIds[topic] ?? [];
    const selected = ids.map((id) => facts.find((fact) => fact.id === id)).filter((fact): fact is Fact => Boolean(fact));
    if (!selected.length) throw new Error("selection");
    return NextResponse.json({ facts: selected, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("grounded_companion_failure", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "The sun companion could not retrieve a grounded answer. Try again shortly." }, { status: 502 });
  }
}
