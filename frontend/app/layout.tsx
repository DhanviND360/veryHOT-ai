import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./companion.css";

export const metadata: Metadata = {
  title: "veryHOT.ai — Hyderabad heat intelligence",
  description: "Live heat outlook and verified water point information for Hyderabad.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111311",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
