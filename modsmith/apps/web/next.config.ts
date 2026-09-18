import path from "node:path";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy. Three.js / R3F need blob: workers and data: textures.
 * Stripe Checkout is a redirect (no iframe) so no stripe.js frames are required.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} blob:`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://*.r2.cloudflarestorage.com https://*.amazonaws.com http://localhost:9000 http://127.0.0.1:9000 https://api.sketchfab.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src https://checkout.stripe.com https://billing.stripe.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // The app lives in a pnpm workspace, so file tracing must start at the repo root or the
  // standalone bundle misses linked packages such as @modsmith/services and the Prisma client.
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  transpilePackages: ["@modsmith/core", "@modsmith/db", "@modsmith/services", "three"],
  serverExternalPackages: ["argon2", "bullmq", "ioredis", "pino", "@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
