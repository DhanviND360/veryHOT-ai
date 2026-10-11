import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json([]);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" }).toString();
    const upstream = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "veryHOT.ai/1.0 (Hyderabad heat intelligence frontend)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return NextResponse.json({ error: "Place search is temporarily unavailable." }, { status: 502 });
    return NextResponse.json(await upstream.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Place search could not be reached." }, { status: 502 });
  }
}
