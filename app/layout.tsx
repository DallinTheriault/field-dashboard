import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { themeBootstrapScript } from "@/components/shell/theme-toggle";
import packageJson from "../package.json";
import "./globals.css";

// Cache-bust query param. Browsers (especially Safari + iOS PWA shells)
// cache favicons hard. Bumping the version invalidates them on next load.
const V = `?v=${packageJson.version}`;

// next/font/google fetches font files at BUILD TIME, not runtime. Requires
// the build machine to reach fonts.googleapis.com. Netlify has internet so
// this works in production. Local builds need internet access too. Do NOT
// remove these imports to make the build "lighter" — we ship without web
// fonts the moment they're stripped, and the system fallback differs across
// platforms (San Francisco on Mac, Segoe on Windows, etc.).
//
// If you need to build offline, use Inter/JetBrains-Mono local files
// (see /public/fonts) instead of stripping these imports.

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Field", template: "%s · Field" },
  description: "AI Voice Receptionist",
  icons: {
    icon: [
      { url: `/favicon.svg${V}`, type: "image/svg+xml" },
      { url: `/favicon-32.png${V}`, sizes: "32x32", type: "image/png" },
      { url: `/favicon-16.png${V}`, sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: `/apple-touch-icon.png${V}`, sizes: "180x180" }],
    shortcut: [`/favicon.svg${V}`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // minimumScale=1 + maximumScale=1 prevents iOS Safari from auto-zooming
  // when it momentarily measures content as wider than viewport (which
  // happens during dynamic-toolbar transitions and keyboard show/hide).
  // Users can still use accessibility zoom at the OS level — this only
  // disables the in-page pinch-zoom, which is the right tradeoff for an
  // app-style PWA.
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // interactiveWidget=resizes-content prevents the keyboard from
  // shrinking the layout viewport on iOS, which was causing the
  // bottom nav to lift during scroll-bounce.
  interactiveWidget: "resizes-content",
  // Two variants so iOS status bar / Android URL bar match the active theme.
  // Single static value here would leave the opposite mode showing the wrong
  // color (e.g. #1A1E1D under light mode = white strip below cream content).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F4F0" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1E1D" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
