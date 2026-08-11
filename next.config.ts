import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this repository. Without it Turbopack walks up the
  // filesystem and can adopt an unrelated lockfile from a parent directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
