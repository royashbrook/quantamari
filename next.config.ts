import type { NextConfig } from "next";

// NOTE: Next's `basePath` is NOT used here even though the site is served under a subpath
// (royashbrook.com/quarkatamari). vinext's static export drops index.html when basePath is set, so
// the deploy rewrites the built absolute paths instead. Keep the build root-relative.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
