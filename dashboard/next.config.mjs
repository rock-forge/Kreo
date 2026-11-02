import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactCompiler: true,
  turbopack: {
    root: dashboardRoot,
  },
};

export default nextConfig;
