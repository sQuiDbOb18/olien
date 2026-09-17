import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";

// Inter, because the console follows Squads' typography rather than a phone app's.
// Geist stays loaded for the variables the shared stylesheet still names.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const description = "A team account for stablecoins. Members approve together, spend under limits, and sign with a passkey.";

export const metadata: Metadata = {
  title: { default: "Olien", template: "%s | Olien" },
  description,
  openGraph: { title: "Olien", description, url: "/", siteName: "Olien", type: "website" },
  twitter: { card: "summary_large_image", title: "Olien", description },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
