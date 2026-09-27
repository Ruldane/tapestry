import type { Metadata, Viewport } from "next";
import { Alegreya, Alegreya_Sans_SC, Uncial_Antiqua } from "next/font/google";
import "./globals.css";

/* Book text and the keeper's voice: a humanist, calligraphic serif made for long reading. */
const alegreya = Alegreya({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-book",
  display: "swap",
});

/* Labels and controls: the same family's sans, in small capitals. */
const alegreyaSC = Alegreya_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-label",
  display: "swap",
});

/* Latin set in type (the cloth itself is lettered in thread): an uncial hand. */
const uncial = Uncial_Antiqua({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Unfinished Tapestry",
  description:
    "The Hanging of Ashcombe, begun in the year 1382 and still being stitched. A living embroidery of one fictional English village that keeps your clock, notices you, and remembers.",
  openGraph: {
    title: "The Unfinished Tapestry",
    description: "The Hanging of Ashcombe, begun in the year 1382 and still being stitched.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#171b1e" },
    { media: "(prefers-color-scheme: light)", color: "#3d454a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${alegreya.variable} ${alegreyaSC.variable} ${uncial.variable}`}>
      <body>{children}</body>
    </html>
  );
}
