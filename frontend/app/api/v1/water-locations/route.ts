import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = process.env.VERYHOT_API_BASE_URL;
  if (!base) return NextResponse.json({ error: "VERYHOT_API_BASE_URL is not configured." }, { status: 500 });
  const query = request.nextUrl.searchParams.toString();
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/water-locations${query ? `?${query}` : ""}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The live water locations service could not be reached." }, { status: 502 });
  }
}
