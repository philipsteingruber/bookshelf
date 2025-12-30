import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [new URL("https://3k01dt1q3i.ufs.sh/**/*")],
  },
  devIndicators: false,
};

export default nextConfig;
