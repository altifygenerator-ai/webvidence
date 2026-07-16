import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    cpus: 2,
    serverActions: { bodySizeLimit: '1mb' },
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'webvidence.app' }],
        destination: 'https://www.webvidence.app/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
