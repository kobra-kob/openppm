import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// Cible du proxy API, résolue côté serveur : le navigateur ne parle qu'à
// l'origine du front (même origine → pas de CORS, pas d'URL d'API figée).
// - Dev : http://localhost:4000 (API locale)
// - Docker : http://api:4000 (nom de service du réseau compose, injecté au build)
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_PROXY_TARGET}/api/v1/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
