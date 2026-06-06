import { ImageResponse } from "next/og";

// Personalized link preview for draft-league invites. Logged-out scrapers hit
// RLS, so we read the league name with the service role (server-only) to render
// "You're invited to {league}". Falls back to generic copy if unavailable.
export const runtime = "nodejs";
export const alt = "You're invited to a Fantasy World Cup league";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getLeague(code) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(
      `${url}/rest/v1/wc_leagues?invite_code=eq.${String(code).toUpperCase()}&select=name,format,draft_type&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (e) { return null; }
}

export default async function Image({ params }) {
  const { code } = await params;
  const league = await getLeague(code);
  const name = league?.name;
  const kind = league
    ? `${league.draft_type === "auction" ? "Live auction" : "Snake"} · ${league.format === "player" ? "players draft" : "nations draft"}`
    : "Fantasy World Cup draft league";
  const nameSize = !name ? 60 : name.length > 22 ? 56 : name.length > 14 ? 72 : 88;

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
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6, color: "#fca5a5" }}>YOU&apos;RE INVITED TO</div>
        <div style={{ fontSize: nameSize, fontWeight: 800, letterSpacing: -2, marginTop: 14, maxWidth: 1000, lineHeight: 1.05 }}>
          {name || "a Fantasy World Cup league"}
        </div>
        <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 18 }}>{kind}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 48 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#dc2626" }} />
          <div style={{ fontSize: 34, fontWeight: 800 }}>The Nosebleeds</div>
        </div>
        <div style={{ display: "flex", marginTop: 26, background: "#dc2626", color: "white", fontSize: 27, fontWeight: 800, padding: "14px 40px", borderRadius: 999 }}>
          Tap to join — free
        </div>
      </div>
    ),
    { ...size }
  );
}
