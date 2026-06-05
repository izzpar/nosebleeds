import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import InstallPrompt from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  metadataBase: new URL("https://thenosebleeds.app"),
  title: "The Nosebleeds — Free Fantasy World Cup 2026 & Game Ratings",
  description: "Free Fantasy World Cup 2026 with friends: rank all 48 nations, build a salary-cap squad, draft players, and rate every match on shared leaderboards. Plus rate & review games across every sport.",
  applicationName: "The Nosebleeds",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nosebleeds",
  },
  openGraph: {
    title: "The Nosebleeds — Free Fantasy World Cup 2026 & Game Ratings",
    description: "Free Fantasy World Cup 2026 with friends: rank all 48 nations, build a salary-cap squad, draft players, and rate every match on shared leaderboards.",
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
      </body>
    </html>
  );
}
