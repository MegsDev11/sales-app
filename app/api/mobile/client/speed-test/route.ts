import { NextResponse } from "next/server";
import { getClientAccountFromRequest } from "@/lib/mobile/client-auth";

const MAX_DOWN_BYTES = 6_000_000;
const MAX_UP_BYTES = 3_000_000;

export async function GET(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const phase = url.searchParams.get("phase") ?? "ping";

  if (phase === "ping") {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (phase === "down") {
    const requested = Number(url.searchParams.get("bytes") || 2_000_000);
    const bytes = Math.min(
      Math.max(Number.isFinite(requested) ? Math.floor(requested) : 2_000_000, 64_000),
      MAX_DOWN_BYTES
    );

    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= bytes) {
          controller.close();
          return;
        }
        const n = Math.min(chunk.length, bytes - sent);
        controller.enqueue(chunk.subarray(0, n));
        sent += n;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(bytes),
      },
    });
  }

  return NextResponse.json({ error: "Unknown phase" }, { status: 400 });
}

export async function POST(request: Request) {
  const account = await getClientAccountFromRequest(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const phase = url.searchParams.get("phase") ?? "up";
  if (phase !== "up") {
    return NextResponse.json({ error: "Unknown phase" }, { status: 400 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ bytes: 0 });
  }

  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    if (total > MAX_UP_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { error: "Upload too large", bytes: total },
        { status: 413 }
      );
    }
  }

  return NextResponse.json({ bytes: total });
}
