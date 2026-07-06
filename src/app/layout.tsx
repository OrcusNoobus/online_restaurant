import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { CartFab } from "@/components/cart/CartFab";
import { ChatFab } from "@/components/chat/ChatFab";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Royal Food Delivery — livrare la domiciliu în Sântana de Mureș",
  description:
    "Meniul Royal Food Delivery: pizza, burgeri, ciorbe și băuturi, cu livrare la domiciliu în Sântana de Mureș.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <CartFab />
        {/* unconfigured assistant = no chat entry point at all (008 research D3) */}
        {process.env.ANTHROPIC_API_KEY ? <ChatFab /> : null}
      </body>
    </html>
  );
}
