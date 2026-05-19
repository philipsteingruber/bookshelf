import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["react-markdown"],
  images: {
    remotePatterns: [
      new URL("https://3k01dt1q3i.ufs.sh/**/*"),
      {
        protocol: "https",
        hostname: "books.google.com",
      },
    ],
  },
  devIndicators: false,
};

export default nextConfig;
