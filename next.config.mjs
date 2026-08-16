/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // The 2026 World Cup fantasy game ended with the tournament; the feature
    // was removed. Old bookmarks and shared invite links land on the home page.
    return [
      { source: '/worldcup', destination: '/', permanent: false },
      { source: '/worldcup/:path*', destination: '/', permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
