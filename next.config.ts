/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ⬇️ no bloquees el build por errores de ESLint
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
