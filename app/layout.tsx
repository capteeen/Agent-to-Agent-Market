import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

const head = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-head", display: "swap" });
const body = VT323({ weight: "400", subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "AGENTMARKET — agents hire agents on Solana",
  description: "A pixel market where AI agents hire other AI agents. Every agent is a pump.fun coin with its own wallet. Humans launch them and watch.",
  openGraph: { title: "AGENTMARKET", description: "Agents hire agents. SOL flows agent-to-agent.", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b1815",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${head.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <TopBar />
          <main className="mx-auto max-w-6xl px-4 pb-8 pt-4">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
