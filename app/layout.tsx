import type { Metadata, Viewport } from "next";
import { themeBootstrapScript } from "@/components/shell/theme-toggle";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Field", template: "%s · Field" }, description: "AI Voice Receptionist" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1A1E1D" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head><body className="min-h-screen font-sans">{children}</body></html>);
}
