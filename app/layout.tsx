import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "eBay Agent System",
  description: "AI-powered policy-compliant eBay automation dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-ink-50 text-ink-900 antialiased dark:bg-ink-950`}>
        {children}
      </body>
    </html>
  );
}
