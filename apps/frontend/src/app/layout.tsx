import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

const match = localFont({
  src: [
    { path: "../fonts/MatchVariableWEB-Upright.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/MatchVariableWEB-Italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-match",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elova",
  description: "Workflow observability for n8n",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={match.variable}>
      <body>{children}</body>
    </html>
  );
}
