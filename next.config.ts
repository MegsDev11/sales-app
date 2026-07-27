import type { NextConfig } from "next";

/**
 * Baseline security headers.
 *
 * No CSP yet — this app uses inline styles and a QR/barcode scanner that would need
 * careful policy work, and a CSP that has to be disabled the first time something
 * breaks is worse than none. Add it deliberately, in report-only mode first.
 */
const securityHeaders = [
  // Don't leak dashboard URLs (which contain lead and job ids) to third-party sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // Camera stays enabled for self: the stock QR/barcode scanner needs it.
    value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Never let a proxy or browser cache an API response containing staff or
        // client data.
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
