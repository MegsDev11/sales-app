import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
]);

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Expo / LAN device testing (private network hosts on common Expo ports)
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const privateLan =
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);
    const expoPort = url.port === "8081" || url.port === "19006" || url.port === "19000";
    return privateLan && expoPort;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!isApi) return NextResponse.next();

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, X-Requested-With"
      );
      res.headers.set("Access-Control-Max-Age", "86400");
      res.headers.set("Vary", "Origin");
    }
    return res;
  }

  const res = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
