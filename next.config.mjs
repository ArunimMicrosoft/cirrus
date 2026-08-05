/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export produces a plain HTML/JS bundle in ./out which Cloudflare
  // Pages serves. All server-side logic lives in ./functions (Pages Functions
  // on the Workers runtime).
  output: "export",
  reactStrictMode: true,
  images: {
    // next/image optimization requires a server. Disable for static export.
    unoptimized: true,
  },
  // IMPORTANT: trailingSlash must be false. Setting it to true redirects
  // `/api/auth/login` -> `/api/auth/login/` which breaks Pages Functions
  // routing (a redirect converts POST to GET, killing auth requests).
  trailingSlash: false,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
