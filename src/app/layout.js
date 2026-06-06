import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import InstallPrompt from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";
import { Analytics } from "@vercel/analytics/react";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  metadataBase: new URL("https://thenosebleeds.app"),
  title: "The Nosebleeds — Free Fantasy World Cup 2026 & Game Ratings",
  description: "Free Fantasy World Cup 2026: rank all 48 nations, build a salary-cap squad, and draft players — make private leagues to take on your friends, or climb the global leaderboard against the world. Plus rate every match.",
  applicationName: "The Nosebleeds",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nosebleeds",
  },
  openGraph: {
    title: "The Nosebleeds — Free Fantasy World Cup 2026 & Game Ratings",
    description: "Rank the nations, build a salary-cap squad, and draft players. Make private leagues vs your friends or climb the global board against the world — free.",
    url: "https://thenosebleeds.app",
    siteName: "The Nosebleeds",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Nosebleeds — Free Fantasy World Cup 2026 & Game Ratings",
    description: "Free Fantasy World Cup 2026 with friends: rank the nations, build a salary-cap squad, draft players, and rate every match.",
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
