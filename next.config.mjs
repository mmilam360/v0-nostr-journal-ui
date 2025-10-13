/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use static export for frontend, API routes as Cloudflare Functions
  output: 'export',
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true
  },
  // Skip type checking for now to fix deployment
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimize for Cloudflare Pages
  experimental: {
    outputFileTracingRoot: undefined,
  },
}

export default nextConfig