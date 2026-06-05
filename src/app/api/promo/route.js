// Downloadable promo stills for socials (1200×675, 16:9). Visit:
//   /api/promo?v=1  → the four games
//   /api/promo?v=2  → leagues / social angle
import { ImageResponse } from "next/og";

export const runtime = "edge";

const wrap = (children) => (
  <div
    style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "center", padding: "0 80px", color: "white",
      background: "linear-gradient(135deg, #0b2a20 0%, #0a1530 55%, #09090b 100%)",
    }}
  >
    {children}
  </div>
);

const row = (emoji, text) => (
  <div key={text} style={{ display: "flex", alignItems: "center", fontSize: 40, marginTop: 22 }}>
    <span style={{ fontSize: 46, width: 70 }}>{emoji}</span>
    <span style={{ color: "#e4e4e7" }}>{text}</span>
  </div>
);

export async function GET(request) {
  const v = new URL(request.url).searchParams.get("v") || "1";

  const card1 = wrap(
    <>
      <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", fontWeight: 700 }}>🩸🏆 THE NOSEBLEEDS</div>
      <div style={{ display: "flex", fontSize: 66, fontWeight: 800, color: "white", marginTop: 8 }}>Free Fantasy World Cup 2026</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
        {row("🔢", "Rank all 48 nations")}
        {row("💰", "€100m salary-cap squad")}
        {row("⚽", "Draft a squad with friends")}
        {row("⭐", "Rate every match & player")}
      </div>
      <div style={{ display: "flex", fontSize: 30, color: "#fca5a5", fontWeight: 700, marginTop: 36 }}>thenosebleeds.app</div>
    </>
  );

  const card2 = wrap(
    <>
      <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", fontWeight: 700 }}>🩸🏆 THE NOSEBLEEDS</div>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "white", marginTop: 8 }}>Your group chat&apos;s</div>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#fca5a5" }}>World Cup HQ</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
        {row("👥", "Private leagues with friends")}
        {row("🌍", "Or climb the global leaderboard")}
        {row("🐍", "Snake & live auction drafts")}
        {row("⭐", "Rate every match together")}
      </div>
      <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", marginTop: 36 }}>Free · no signup to look around · thenosebleeds.app</div>
    </>
  );

  return new ImageResponse(v === "2" ? card2 : card1, { width: 1200, height: 675 });
}
