import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primereact/resources/primereact.min.css";
import "primeflex/primeflex.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "File Brain - Intelligent Local File Search & Document Finder";
const SITE_DESCRIPTION = "File Brain is the intelligent local file search engine for your desktop. Find documents, images, and files instantly with semantic search and OCR. Privacy-first and works completely offline.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    "file search",
    "local search",
    "AI search",
    "semantic search",
    "document finder",
    "OCR search",
    "local search engine",
    "file indexing",
    "privacy-first",
    "offline search",
    "desktop search",
    "file management",
    "document search",
  ],
  authors: [{ name: "Hamza Abbad" }],
  creator: "Hamza Abbad",
  publisher: "File Brain",
  applicationName: "File Brain",
  metadataBase: new URL("https://file-brain.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://file-brain.com",
    siteName: "File Brain",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "File Brain",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Windows, macOS, Linux",
  description: SITE_DESCRIPTION,
  url: "https://file-brain.com",
  author: {
    "@type": "Person",
    name: "Hamza Abbad",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  softwareVersion: "latest",
  downloadUrl: "https://github.com/Hamza5/file-brain",
  featureList: [
    "Semantic search using vector embeddings",
    "Built-in OCR for scanned documents",
    "Supports 1000+ file formats",
    "100% offline and privacy-first",
    "Model Context Protocol (MCP) support",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plusJakartaSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        <Navbar />
        {children}
      </body>
    </html>
  );
}

