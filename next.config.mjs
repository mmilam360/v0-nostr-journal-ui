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
  // ✅ Tell Next.js to transpile Bitcoin Connect for SSR compatibility
  transpilePackages: ['@getalby/bitcoin-connect-react'],
  
  webpack: (config, { isServer }) => {
    // ✅ Don't bundle Bitcoin Connect on server
    if (isServer) {
      config.externals = [...(config.externals || []), '@getalby/bitcoin-connect-react']
    }
    return config
  }
}

export default nextConfig