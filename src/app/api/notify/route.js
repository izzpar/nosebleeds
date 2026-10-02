// src/app/api/notify/route.js
// Game alerts (web push), run every 10 minutes by Vercel Cron:
//   kickoff — a subscriber's favorite team starts within 15 minutes
//   final   — a game ended that they hyped, rooted in, or whose team they
//             follow, and they haven't rated it yet
//   friend  — someone they follow rated a game they also rated
// Each alert goes to a user once (push_log). Dormant until configured:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (VAPID_SUBJECT), plus the
//   push_subscriptions and push_log tables from supabase/setup.sql.
import webpush from "web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const EMOJI = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" };
const favCol = (sport) => (sport === "nfl" ? "favorite_team" : `favorite_team_${sport}`);
const gameUrl = (sport, id) => (sport === "nfl" ? `/game/${id}` : `/game/${id}?sport=${sport}`);
const MIN = 60000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}
const rows = async (path) => { const r = await sb(path); return r.ok ? r.json() : []; };
const inList = (ids) => `in.(${ids.map((x) => `"${x}"`).join(",")})`;
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function loadGames() {
  const now = new Date();
  const range = `${ymd(new Date(now.getTime() - 24 * 60 * MIN))}-${ymd(new Date(now.getTime() + 24 * 60 * MIN))}`;
  const out = [];
  for (const sport of Object.keys(SPORT_PATHS)) {
    try {
      const qs = sport === "nfl" ? "" : `?dates=${range}&limit=300`;
      const d = await (await fetch(`${ESPN_BASE}/${SPORT_PATHS[sport]}/scoreboard${qs}`)).json();
      for (const e of d.events || []) {
        const c = e.competitions?.[0];
        const home = c?.competitors?.find((t) => t.homeAway === "home");
        const away = c?.competitors?.find((t) => t.homeAway === "away");
        if (!home || !away) continue;
        const team = (t) => ({ abbr: t.team?.abbreviation, name: t.team?.shortDisplayName || t.team?.displayName, score: t.score });
        out.push({ id: String(e.id), sport, start: Date.parse(e.date), state: c.status?.type?.state, done: !!c.status?.type?.completed, home: team(home), away: team(away) });
      }
    } catch (e) { /* skip this sport this run */ }
  }
  return out;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !SERVICE_KEY) return Response.json({ ok: true, skipped: "push not configured" });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:alerts@thenosebleeds.app", pub, priv);

  const subsRes = await sb("push_subscriptions?select=user_id,endpoint,p256dh,auth");
  if (!subsRes.ok) return Response.json({ ok: true, skipped: "push_subscriptions table missing" });
  const subs = await subsRes.json();
  if (subs.length === 0) return Response.json({ ok: true, sent: 0 });
  const subUsers = [...new Set(subs.map((s) => s.user_id))];
  const now = Date.now();
  const alerts = []; // { user_id, key, title, body, url }

  const profiles = await rows(`profiles?user_id=${inList(subUsers)}&select=user_id,favorite_team,favorite_team_mlb,favorite_team_nba,favorite_team_nhl`);
  const fans = (sport, g) => profiles.filter((p) => [g.home.abbr, g.away.abbr].includes(p[favCol(sport)])).map((p) => p.user_id);
  const games = await loadGames();

  // Kickoff within 15 minutes, for fans of either team
  for (const g of games.filter((x) => x.state === "pre" && x.start - now > 0 && x.start - now <= 15 * MIN)) {
    const mins = Math.max(1, Math.round((g.start - now) / MIN));
    for (const u of fans(g.sport, g)) alerts.push({ user_id: u, key: `kick:${g.id}`, title: `${EMOJI[g.sport]} ${g.away.name} at ${g.home.name}`, body: `Starts in ${mins} min — set your hype.`, url: gameUrl(g.sport, g.id) });
  }

  // Finals from the last 8 hours that a subscriber cared about but hasn't rated
  const finals = games.filter((x) => x.done && now - x.start < 8 * 60 * MIN);
  if (finals.length) {
    const theirs = await rows(`ratings?game_id=${inList(finals.map((g) => g.id))}&user_id=${inList(subUsers)}&select=user_id,game_id,rating,anticipation,rooting_for`);
    for (const g of finals) {
      const mine = theirs.filter((r) => r.game_id === g.id);
      const rated = new Set(mine.filter((r) => r.rating != null).map((r) => r.user_id));
      const cared = new Set([...fans(g.sport, g), ...mine.filter((r) => r.anticipation != null || r.rooting_for).map((r) => r.user_id)]);
      for (const u of cared) if (!rated.has(u)) alerts.push({ user_id: u, key: `final:${g.id}`, title: `Final: ${g.away.abbr} ${g.away.score}–${g.home.score} ${g.home.abbr}`, body: "How was it? Rate the game while it's fresh.", url: gameUrl(g.sport, g.id) });
    }
  }

  // Friends' new ratings (last 15 min) on games the subscriber also rated
  const fresh = await rows(`ratings?created_at=gte.${new Date(now - 15 * MIN).toISOString()}&rating=not.is.null&public=eq.true&select=user_id,game_id,rating,away_team,home_team,sport`);
  if (fresh.length) {
    const raters = [...new Set(fresh.map((r) => r.user_id))];
    const links = await rows(`follows?following_id=${inList(raters)}&follower_id=${inList(subUsers)}&select=follower_id,following_id`);
    if (links.length) {
      const followers = [...new Set(links.map((l) => l.follower_id))];
      const theirRatings = await rows(`ratings?user_id=${inList(followers)}&game_id=${inList([...new Set(fresh.map((r) => r.game_id))])}&rating=not.is.null&select=user_id,game_id,rating`);
      const names = Object.fromEntries((await rows(`profiles?user_id=${inList(raters)}&select=user_id,display_name,handle`)).map((p) => [p.user_id, (p.display_name || p.handle || "A friend").split(" ")[0]]));
      for (const l of links) {
        for (const r of fresh.filter((x) => x.user_id === l.following_id)) {
          const yours = theirRatings.find((x) => x.user_id === l.follower_id && x.game_id === r.game_id);
          if (!yours) continue;
          alerts.push({ user_id: l.follower_id, key: `friend:${r.user_id}:${r.game_id}`, title: `👥 ${names[r.user_id] || "A friend"} rated ${r.away_team}–${r.home_team} a ${r.rating}`, body: `You gave it ${yours.rating}. See what they said.`, url: gameUrl(r.sport || "nfl", r.game_id) });
        }
      }
    }
  }

  if (alerts.length === 0) return Response.json({ ok: true, sent: 0 });

  // Claim each alert once: the insert only returns rows that weren't already logged.
  const claim = await sb("push_log?on_conflict=user_id,key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(alerts.slice(0, 500).map((a) => ({ user_id: a.user_id, key: a.key }))),
  });
  if (!claim.ok) return Response.json({ ok: true, skipped: "push_log table missing" });
  const claimed = new Set((await claim.json()).map((r) => `${r.user_id}|${r.key}`));

  let sent = 0, removed = 0;
  for (const a of alerts.filter((x) => claimed.has(`${x.user_id}|${x.key}`))) {
    for (const s of subs.filter((x) => x.user_id === a.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: a.title, body: a.body, url: a.url, tag: a.key }));
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { // phone unsubscribed or reinstalled
          await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
          removed++;
        }
      }
    }
  }
  return Response.json({ ok: true, alerts: alerts.length, sent, removed });
}
