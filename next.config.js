/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright hits the dev server via 127.0.0.1; Next 16 blocks cross-origin dev assets by default.
  allowedDevOrigins: ["127.0.0.1"],
};

module.exports = nextConfig;
