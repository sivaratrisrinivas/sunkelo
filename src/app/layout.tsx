import type { Metadata, Viewport } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "devanagari"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
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
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={notoSans.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
