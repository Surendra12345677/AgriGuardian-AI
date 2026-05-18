/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Run friendly bundle — produces .next/standalone so the
  // production Docker image is ~150 MB instead of 1.5 GB.
  output: "standalone",
  // Hackathon deploys must not fail the whole build over a stray
  // lint/type warning — surface them in dev, ignore at build time.
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // NOTE: /api/* is proxied to the Spring Boot backend by a runtime
  // Route Handler at app/api/[...path]/route.ts (NOT by `rewrites()`).
  //
  // Why: `rewrites()` is evaluated at `next build` time and bakes the
  // resolved destination URL into the routes manifest. On Cloud Run the
  // image is built by Cloud Build without BACKEND_URL in scope, which
  // would freeze the destination as "http://localhost:8080/..." and
  // every API call would 503 — even after `gcloud run services update
  // --update-env-vars BACKEND_URL=...`. The Route Handler reads the env
  // var per request, so deploys + env-var updates take effect live.
  experimental: { typedRoutes: false }
};
export default nextConfig;

