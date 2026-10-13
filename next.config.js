/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tatnet/Layer0 часто требуют standalone-вывод для контейнеризации edge-слоя
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    },
  ],
};

module.exports = nextConfig;
