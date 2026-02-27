import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  transpilePackages: [
    "@axel-delafosse/ui",
    "@axel-delafosse/agent-runtime",
    "@axel-delafosse/protocol",
  ],
  experimental: {
    externalDir: true,
  },
}

export default nextConfig
