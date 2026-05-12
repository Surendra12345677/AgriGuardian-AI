/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to the Spring Boot backend so the browser never hits CORS.
  // Override BACKEND_URL when running outside docker (e.g. http://localhost:8080).
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  experimental: { typedRoutes: false }
};
export default nextConfig;

