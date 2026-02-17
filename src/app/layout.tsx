import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "SunkeLo — Voice-First Product Research",
  description:
    "Ask about any product in your language. Get a spoken verdict from aggregated reviews.",
  keywords: ["product reviews", "voice search", "Indian languages", "product research"],
  authors: [{ name: "SunkeLo" }],
  openGraph: {
    title: "SunkeLo — Voice-First Product Research",
    description: "Ask about any product in your language. Get a spoken verdict.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
