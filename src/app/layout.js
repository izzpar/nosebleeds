import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";

const font = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "The Nosebleeds",
  description: "Rate and review every game you watch",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${font.className} bg-[#09090b] text-white min-h-screen`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
