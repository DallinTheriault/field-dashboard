import type { MetadataRoute } from "next";
import packageJson from "../package.json";

// Append the package version as a query param to icon URLs so iOS/Android
// PWA installs pick up the new icon when we change the design. iOS in
// particular caches PWA icons aggressively — even removing and re-adding
// the home-screen bookmark doesn't always invalidate.
const V = `?v=${packageJson.version}`;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Field",
    short_name: "Field",
    description: "AI Voice Receptionist",
    start_url: "/app",
    display: "standalone",
    background_color: "#1A1E1D",
    theme_color: "#1A1E1D",
    orientation: "portrait",
    icons: [
      {
        src: `/icon-192.png${V}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-512.png${V}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-1024.png${V}`,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/apple-touch-icon.png${V}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
