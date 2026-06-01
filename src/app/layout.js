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
  title: "The Nosebleeds",
  description: "Rate and review every game you watch",
  applicationName: "The Nosebleeds",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nosebleeds",
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
