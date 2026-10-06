/** @type {import('next').NextConfig} */
const remote = process.env.NEXT_PUBLIC_MARKET_SOURCE === "remote";
// Where the market server lives. The browser talks to /api/* on this app and
// Next proxies to it, so there is no CORS and one origin to deploy.
const api = process.env.MARKET_API_URL ?? "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!remote) return [];
    return {
      beforeFiles: [
        { source: "/api/market/:path*", destination: `${api}/api/market/:path*` },
        { source: "/api/agents/:path*", destination: `${api}/api/agents/:path*` },
        { source: "/api/agents", destination: `${api}/api/agents` },
        { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
        { source: "/api/health", destination: `${api}/api/health` },
      ],
    };
  },
};

export default nextConfig;
