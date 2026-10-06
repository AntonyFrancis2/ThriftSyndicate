import type { Metadata } from "next";
import { Anton, Inter, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/config";
import { themeTokens } from "@/lib/theme";
import { getSiteTheme } from "@/lib/theme-cache";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "ThriftSyndicate — Retro & latest tees, jeans and jerseys", template: "%s · ThriftSyndicate" },
  description: "One piece. One owner. Yours next. Retro and current-season T-shirts, jeans and jerseys from our two stores.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The admin-editable colour scheme overrides the defaults in globals.css.
  const theme = themeTokens(await getSiteTheme());
  return (
    <html lang="en-IN" style={theme as React.CSSProperties} className={`${anton.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
