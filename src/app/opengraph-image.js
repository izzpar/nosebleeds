import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "The Nosebleeds — Fantasy World Cup 2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded share preview (shown when the link is posted anywhere).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", textAlign: "center",
          background: "linear-gradient(150deg, #0b2a20 0%, #0a1530 45%, #09090b 100%)",
          color: "white", padding: "0 80px",
        }}
      >
        <div style={{ fontSize: 120, marginBottom: 8 }}>🩸 🏆</div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>The Nosebleeds</div>
        <div style={{ fontSize: 40, fontWeight: 700, color: "#fca5a5", marginTop: 8 }}>Fantasy World Cup 2026</div>
        <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 24 }}>
          Rankings · salary cap · drafts · match ratings
        </div>
        <div style={{ fontSize: 28, color: "#cbd5e1", marginTop: 10 }}>
          Make leagues vs your friends — or the world
        </div>
        <div style={{ display: "flex", marginTop: 44, background: "#dc2626", color: "white", fontSize: 30, fontWeight: 800, padding: "16px 44px", borderRadius: 999 }}>
          Play free → thenosebleeds.app
        </div>
      </div>
    ),
    { ...size }
  );
}
