// Downloadable X/Twitter header (1500×500). Visit /api/x-header and save the image.
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", textAlign: "center",
          background: "linear-gradient(120deg, #0b2a20 0%, #0a1530 55%, #09090b 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 6 }}>🩸 🏆</div>
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>THE NOSEBLEEDS</div>
        <div style={{ fontSize: 38, fontWeight: 700, color: "#fca5a5", marginTop: 14 }}>Free Fantasy World Cup 2026</div>
        <div style={{ fontSize: 28, color: "#a1a1aa", marginTop: 14 }}>
          Rankings · Salary Cap · Drafts · Match Ratings — vs friends or the world
        </div>
      </div>
    ),
    { width: 1500, height: 500 }
  );
}
