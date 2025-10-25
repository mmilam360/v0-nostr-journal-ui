/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // Disabled - deploying as regular Next.js app for API routes
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'nostr-tools': 'commonjs nostr-tools',
        '@nostr-dev-kit/ndk': 'commonjs @nostr-dev-kit/ndk'
      });
    }

    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      fs: false,
      crypto: false,
      stream: false,
      buffer: false,
      process: false,
      util: false,
      url: false,
      assert: false,
      http: false,
      https: false,
      zlib: false,
      path: false,
    };

    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
}

export default nextConfig
