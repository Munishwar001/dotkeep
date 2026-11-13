import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { SiteAnalytics } from "@/modules/analytics/site-analytics";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dotkeep — Your development secrets, organized",
  description:
    "A considered home for API keys, webhooks, environment variables, and developer configurations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Only the live site is counted, not localhost or the preview deploys of other branches. */}
        {process.env.VERCEL_ENV === "production" && <SiteAnalytics />}
      </body>
    </html>
  );
}
