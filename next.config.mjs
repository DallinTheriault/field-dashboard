/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf must resolve the real installed React (18), not Next's
  // vendored server copy — bundling it mixes element types and PDF
  // rendering throws React #31.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
