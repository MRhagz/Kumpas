import type { Metadata } from "next";
import { dmSans, playfair } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kumpas",
  description: "AI Interview Analysis for Career Guidance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
