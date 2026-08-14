import type { NextConfig } from "next";

/**
 * Every route here is static and every action happens in the browser against
 * the user's wallet, so the app needs no server at all. Exporting it as static
 * files means it can be published on GitHub Pages, which is also the first
 * place the sprint looks for a demo.
 *
 * `basePath` matters more than it looks: a project page is served from a
 * subdirectory, and a claim link that omits it points at nothing. It comes from
 * the environment so a local build stays at the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Pages serves plain files, so a route needs to be a directory with an
  // index.html rather than a bare path the server rewrites.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
