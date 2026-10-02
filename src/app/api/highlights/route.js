// src/app/api/highlights/route.js
// "Watch Highlights" resolver. With YOUTUBE_API_KEY set (YouTube Data API v3,
// server-only — never prefix with NEXT_PUBLIC_), redirects straight to the
// game's highlight video on the league's official channel. Without a key, or
// when nothing matches yet, redirects to a YouTube search instead. Redirect
// targets are always built here, so this can't be used as an open redirect.
//
// Query: sport, q (fallback search text), teams (two comma-separated names
// that must both appear in the video title), start (game start, ISO), and
// optional format=json, which returns { videoId, url } instead of redirecting
// so the game page can play the video in place.
// Quota: a search costs 100 of the free 10,000 daily units, so results are
// CDN-cached per game and only looked up when someone taps the button.

const CHANNELS = {
  nfl: "UCDVYQ4Zhbm3S2dlz7P1GBDg",
  nba: "UCWJ2lWNubArHWmf3FIHbfcQ",
  mlb: "UCoLrcjPV5PbUrUyXq5mjc_A",
  nhl: "UCqFMzb-4AUf6WAIbl132QKA",
};
// League channels title some teams differently than ESPN names them.
const ALIASES = { diamondbacks: "d-backs" };
const DAY = 86400000;

const memo = new Map(); // warm-instance cache: key -> { url, exp }

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const searchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

function respond(asJson, url, sMaxAge, videoId = null) {
  const cache = `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`;
  if (asJson) return Response.json({ videoId, url }, { headers: { "Cache-Control": cache } });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": cache } });
}

// Best video whose title names both sides and says "highlight"; full-game
// cuts beat clips, Shorts lose, and relevance order breaks ties.
function pickVideo(items, names) {
  let best = null;
  for (const it of items || []) {
    const id = it?.id?.videoId;
    if (!/^[\w-]{11}$/.test(id || "")) continue;
    const t = norm(decode(it.snippet?.title || ""));
    if (!names.every((n) => t.includes(n) || (ALIASES[n] && t.includes(ALIASES[n])))) continue;
    if (!t.includes("highlight")) continue;
    const score = (/game highlights|full game|match highlights|extended highlights/.test(t) ? 2 : 0) - (/#shorts/.test(t) ? 3 : 0);
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id || null;
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const asJson = sp.get("format") === "json";
  const sport = sp.get("sport") || "";
  const names = (sp.get("teams") || "").split(",").map((n) => norm(n.trim())).filter((n) => n && n.length <= 40).slice(0, 2);
  const q = (sp.get("q") || "").slice(0, 200) || (names.length ? `${names.join(" vs ")} highlights` : "");
  if (!q) return new Response("missing q", { status: 400 });
  const fallback = searchUrl(q);

  const key = process.env.YOUTUBE_API_KEY;
  const t0 = Date.parse(sp.get("start") || "");
  if (!key || names.length < 2 || !Number.isFinite(t0) || !(sport in CHANNELS || sport === "tennis")) {
    return respond(asJson, fallback, 300);
  }

  const memoKey = `${sport}|${names.join(",")}|${t0}`;
  const hit = memo.get(memoKey);
  if (hit && hit.exp > Date.now()) return respond(asJson, hit.url, 2592000, hit.id);

  try {
    const params = new URLSearchParams({
      part: "snippet", type: "video", maxResults: "10", order: "relevance",
      q: `${names.join(" ")} highlights`,
      publishedAfter: new Date(t0).toISOString(),
      publishedBefore: new Date(t0 + 4 * DAY).toISOString(),
      key,
    });
    if (CHANNELS[sport]) params.set("channelId", CHANNELS[sport]); // tennis: no single official channel
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return respond(asJson, fallback, 600); // quota exhausted, bad key, etc.
    const id = pickVideo((await r.json()).items, names);
    if (id) {
      const url = `https://www.youtube.com/watch?v=${id}`;
      if (memo.size >= 500) memo.delete(memo.keys().next().value);
      memo.set(memoKey, { url, id, exp: Date.now() + 30 * DAY });
      return respond(asJson, url, 2592000, id);
    }
    // Nothing yet: retry soon while the upload window is open, then settle.
    return respond(asJson, fallback, Date.now() - t0 > 4 * DAY ? 86400 : 900);
  } catch (e) {
    return respond(asJson, fallback, 300);
  }
}
