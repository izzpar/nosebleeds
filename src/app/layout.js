import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import InstallPrompt from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";
import { Analytics } from "@vercel/analytics/next";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  metadataBase: new URL("https://thenosebleeds.app"),
  title: "The Nosebleeds — Rate Every Game",
  description: "Letterboxd for sports: rate and review every NFL, MLB, NBA, NHL, and tennis game, keep a diary, build lists, pick winners, and ride your streak against friends.",
  applicationName: "The Nosebleeds",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nosebleeds",
  },
  openGraph: {
    title: "The Nosebleeds — Rate Every Game",
    description: "Rate and review every game across NFL, MLB, NBA, NHL, and tennis. Keep a diary, build lists, and pick winners with friends — free.",
    url: "https://thenosebleeds.app",
    siteName: "The Nosebleeds",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Nosebleeds — Rate Every Game",
    description: "Rate and review every game across NFL, MLB, NBA, NHL, and tennis — diary, lists, predictions, and streaks with friends.",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${font.className} bg-[#09090b] text-white min-h-screen`}>
        <AuthProvider>
          <OfflineBanner />
          {children}
          <InstallPrompt />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
