import localFont from "next/font/local";

export const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "300 500",
  style: "normal",
  display: "swap",
  variable: "--font-dm-sans",
});

export const playfair = localFont({
  src: [
    {
      path: "./fonts/playfair-display-latin.woff2",
      weight: "700 900",
      style: "normal",
    },
    {
      path: "./fonts/playfair-display-latin-italic.woff2",
      weight: "700 900",
      style: "italic",
    },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--font-playfair",
});
