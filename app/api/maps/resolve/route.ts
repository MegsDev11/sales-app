import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import { parseMapsLocationInput } from "@/lib/maps/parse-maps-location";

async function followRedirects(startUrl: string, maxHops = 10): Promise<string> {
  let current = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MEGS-MapsResolve/1.0; +https://megswaterberg.co.za)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const location = res.headers.get("location");
    if (
      location &&
      [301, 302, 303, 307, 308].includes(res.status)
    ) {
      current = new URL(location, current).toString();
      continue;
    }

    // Some CDNs return 200 on the final URL
    if (res.url && res.url !== current) {
      return res.url;
    }
    return current;
  }
  return current;
}

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const body = (await request.json()) as { url?: string };
    const raw = String(body.url ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    // Fast path: already a full URL or plain coordinates
    const direct = parseMapsLocationInput(raw);
    if (direct) {
      return NextResponse.json({
        ok: true,
        ...direct,
        resolvedUrl: raw.startsWith("http") ? raw : null,
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(raw);
    } catch {
      return NextResponse.json(
        { error: "Paste a Google Maps link or coordinates like -24.70, 28.39" },
        { status: 400 }
      );
    }

    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const allowed =
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "g.co" ||
      host === "share.google" ||
      host.endsWith("google.com") ||
      host.endsWith("google.co.za") ||
      host.endsWith("maps.apple.com");

    if (!allowed) {
      return NextResponse.json(
        { error: "Only Google / Apple Maps links are supported" },
        { status: 400 }
      );
    }

    const resolvedUrl = await followRedirects(raw);
    const parsed = parseMapsLocationInput(resolvedUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Could not read GPS from that link. Open it in Maps, then copy the full link or coordinates.",
          resolvedUrl,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...parsed,
      resolvedUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to resolve map link" },
      { status: 500 }
    );
  }
}
