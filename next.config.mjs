/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf must resolve the real installed React (18), not Next's
  // vendored server copy — bundling it mixes element types and PDF
  // rendering throws React #31.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // Load a page's code when it's first requested, not every route at server
    // start: a cold Netlify function then loads only the page being opened
    // (PDF rendering, receipt scanning and the Stripe webhook stay unloaded
    // until used) instead of the whole app on a fraction of a CPU.
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
