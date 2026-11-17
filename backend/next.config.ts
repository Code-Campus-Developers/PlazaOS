import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — the frontend's package-lock.json one
  // directory up otherwise makes Next.js guess (and warn about) the wrong root.
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
