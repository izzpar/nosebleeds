"use client";
import { useAuth } from "@/components/AuthProvider";
import { accentColor } from "@/lib/drops";

// Recolors the app's accent (default red) to the user's unlocked theme by
// overriding the specific Tailwind red utility classes used for accent. The
// override <style> is rendered after Tailwind, so equal-specificity rules win.
// No theme unlocked → renders nothing → default red everywhere.
export default function ThemeApplier() {
  const { profile } = useAuth();
  const accent = accentColor(profile?.unlocked);
  if (!accent) return null;

  // A darker shade for hover states (mix toward black ~12%)
  const darken = (hex, amt = 0.12) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * (1 - amt));
    const g = Math.round(((n >> 8) & 255) * (1 - amt));
    const b = Math.round((n & 255) * (1 - amt));
    return `rgb(${r}, ${g}, ${b})`;
  };
  const hover = darken(accent);

  const css = `
    .bg-red-600 { background-color: ${accent} !important; }
    .hover\\:bg-red-700:hover, .hover\\:bg-red-600:hover { background-color: ${hover} !important; }
    .text-red-600, .text-red-500, .text-red-400, .hover\\:text-red-400:hover, .hover\\:text-red-300:hover { color: ${accent} !important; }
    .border-red-600 { border-color: ${accent} !important; }
    .bg-red-600\\/10, .bg-red-600\\/15, .bg-red-600\\/20 { background-color: ${accent}26 !important; }
    .border-red-600\\/30, .border-red-600\\/40, .border-red-600\\/50, .hover\\:border-red-600:hover, .hover\\:border-red-600\\/40:hover { border-color: ${accent}66 !important; }
    .accent-red-600 { accent-color: ${accent} !important; }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
