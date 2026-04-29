import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { themeBootstrapScript } from "@/components/shell/theme-toggle";
import "./globals.css";

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
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1A1E1D",
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
