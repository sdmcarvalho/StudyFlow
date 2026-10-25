import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O padrão é 1 MB; o conteúdo de um Estudo pode chegar a 5 MB de JSON (mais a codificação do envio).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
