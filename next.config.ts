import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["react-markdown"],
  images: {
    remotePatterns: [
      new URL("https://3k01dt1q3i.ufs.sh/**/*"),
      new URL("https://9ostrido5oryl0p5.public.blob.vercel-storage.com/**/*"),
      {
        protocol: "https",
        hostname: "books.google.com",
      },
    ],
  },
  devIndicators: false,
};

export default nextConfig;
