"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import Nav from "@/components/Nav";
import { repScore, repTier, nextTier, tierProgress } from "@/lib/reputation";
import { nameColor } from "@/lib/drops";

function rc(r) {
  if (r >= 9) return "#22c55e";
  if (r >= 7.5) return "#84cc16";
  if (r >= 6) return "#eab308";
  if (r >= 4) return "#f97316";
  if (r >= 2) return "#ef4444";
  return "#991b1b";
}

function Bdg({ r }) {
  return (
    <div className="w-12 h-12 flex items-center justify-center text-white font-bold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(r) }}>
      {r.toFixed(1)}
    </div>
  );
}

export default function PublicProfile({ params }) {
  const { handle } = use(params);
  const { user, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [commentsPosted, setCommentsPosted] = useState(0);
  const [likesReceived, setLikesReceived] = useState(0);
  const [tasteMatch, setTasteMatch] = useState(null); // { pct, common } vs the viewer

  const sbFetch = async (path, options = {}) => {
    const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  };

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        // Look up profile by handle
        const pRes = await sbFetch(`profiles?handle=eq.${handle.toLowerCase()}&select=*`);
        const pArr = await pRes.json();
        const profileData = pArr && pArr[0];

        if (!profileData) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setProfile(profileData);

        // Load public ratings for this user
        const rRes = await sbFetch(`ratings?user_id=eq.${profileData.user_id}&public=eq.true&rating=not.is.null&order=created_at.desc&select=*`);
        const ratingsData = await rRes.json();
        if (ratingsData) setRatings(ratingsData);

        // Load follow counts
        const fcRes = await sbFetch(`follows?following_id=eq.${profileData.user_id}&select=id`, { headers: { "Prefer": "count=exact" } });
        const fCount = parseInt(fcRes.headers.get("content-range")?.split("/")[1] || "0");
        setFollowerCount(fCount || 0);
        const gcRes = await sbFetch(`follows?follower_id=eq.${profileData.user_id}&select=id`, { headers: { "Prefer": "count=exact" } });
        const gCount = parseInt(gcRes.headers.get("content-range")?.split("/")[1] || "0");
        setFollowingCount(gCount || 0);

        // Reputation inputs: comments posted + reactions received
        try {
          const cmRes = await sbFetch(`comments?user_id=eq.${profileData.user_id}&select=id`);
          const myComments = await cmRes.json();
          const cIds = Array.isArray(myComments) ? myComments.map((c) => c.id) : [];
          setCommentsPosted(cIds.length);
          if (cIds.length > 0) {
            const rxRes = await sbFetch(`comment_reactions?comment_id=in.(${cIds.join(",")})&select=user_id`);
            const rx = await rxRes.json();
            setLikesReceived((Array.isArray(rx) ? rx : []).filter((r) => r.user_id !== profileData.user_id).length);
          }
        } catch (e) {}

        // Am I following them? + taste match
        if (user && user.id !== profileData.user_id) {
          const fcheckRes = await sbFetch(`follows?follower_id=eq.${user.id}&following_id=eq.${profileData.user_id}&select=id`);
          const fcheckArr = await fcheckRes.json();
          setIsFollowing(fcheckArr && fcheckArr.length > 0);

          // Taste match: compare ratings on games both have rated
          try {
            const myRes = await sbFetch(`ratings?user_id=eq.${user.id}&rating=not.is.null&select=game_id,rating`);
            const mine = await myRes.json();
            const myMap = {};
            (Array.isArray(mine) ? mine : []).forEach((r) => { myMap[r.game_id] = parseFloat(r.rating); });
            const diffs = [];
            (Array.isArray(ratingsData) ? ratingsData : []).forEach((r) => {
              if (myMap[r.game_id] != null) diffs.push(Math.abs(parseFloat(r.rating) - myMap[r.game_id]));
            });
            if (diffs.length >= 3) {
              const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
              setTasteMatch({ pct: Math.round(100 - (avg / 9) * 100), common: diffs.length });
            }
          } catch (e) {}
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    loadProfile();
  }, [handle, user]);

  const isOwn = profile && user?.id === profile.user_id;

  const toggleFollow = async () => {
    if (!user) { window.location.href = "/login"; return; }
    if (!profile || isOwn) return;
    try {
      if (isFollowing) {
        await sbFetch(`follows?follower_id=eq.${user.id}&following_id=eq.${profile.user_id}`, { method: "DELETE" });
        setIsFollowing(false);
        setFollowerCount(followerCount - 1);
      } else {
        await sbFetch(`follows`, { method: "POST", body: JSON.stringify({ follower_id: user.id, following_id: profile.user_id }) });
        setIsFollowing(true);
        setFollowerCount(followerCount + 1);
      }
    } catch (e) { console.error("Follow:", e); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading profile...</div>
  );

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-5xl">🤷</div>
      <div className="text-base font-bold text-white">User @{handle} not found</div>
      <Link href="/" className="text-sm text-red-400 hover:text-red-300">← Back to The Nosebleeds</Link>
    </div>
  );

  const games = ratings.length;
  const reviews = ratings.filter(r => r.review).length;
  const avgRating = games > 0 ? (ratings.reduce((s, r) => s + parseFloat(r.rating), 0) / games).toFixed(1) : "—";
  const topRated = [...ratings].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const repPts = repScore({ ratings: games, reviews, comments: commentsPosted, likes: likesReceived, followers: followerCount });
  const tier = repTier(repPts);
  const nt = nextTier(repPts);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-base font-bold text-white"><span className="text-red-600">🩸</span> The Nosebleeds</h1>
          <div className="w-12"></div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Profile header */}
        <div className="rounded-2xl p-5 bg-zinc-900 border border-zinc-800 mb-4 text-center">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} referrerPolicy="no-referrer" className="w-20 h-20 mx-auto rounded-full mb-3" />
          ) : (
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white text-2xl font-extrabold mb-3">
              {(profile.display_name || profile.handle || "?")[0].toUpperCase()}
            </div>
          )}
          <div className="text-xl font-extrabold" style={{ color: nameColor(profile.unlocked) || "#fafafa" }}>{profile.display_name || profile.handle}</div>
          <div className="text-sm text-red-400 mt-0.5">@{profile.handle}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full" style={{ background: tier.color + "22", color: tier.color }}>
            {tier.emoji} {tier.name} · {repPts.toLocaleString()} Cred
          </div>
          {profile.bio && <div className="text-sm text-zinc-400 mt-2 max-w-xs mx-auto">{profile.bio}</div>}

          {/* Follow stats */}
          <div className="flex gap-4 justify-center mt-3 text-xs text-zinc-500">
            <span><span className="text-white font-bold">{followerCount}</span> followers</span>
            <span><span className="text-white font-bold">{followingCount}</span> following</span>
          </div>

          {/* Taste match vs the viewer */}
          {tasteMatch && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-800">
              <span className="text-base font-extrabold" style={{ color: tasteMatch.pct >= 50 ? "#22c55e" : "#f97316" }}>{tasteMatch.pct}%</span>
              <span className="text-[11px] text-zinc-400">taste match · {tasteMatch.common} shared {tasteMatch.common === 1 ? "game" : "games"}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex gap-2 justify-center">
            {isOwn ? (
              <Link href="/?tab=profile" className="text-xs text-zinc-500 hover:text-red-400 px-3 py-1.5 rounded-full bg-zinc-800">Edit profile →</Link>
            ) : (
              <button onClick={toggleFollow} className={`text-sm font-bold px-5 py-2 rounded-full ${isFollowing ? "bg-zinc-800 text-zinc-300" : "bg-red-600 text-white"}`}>
                {isFollowing ? "Following ✓" : "+ Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-3 rounded-xl bg-zinc-900 text-center">
            <div className="text-2xl font-extrabold text-white">{games}</div>
            <div className="text-[10px] text-zinc-500 font-bold">GAMES</div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900 text-center">
            <div className="text-2xl font-extrabold text-white">{reviews}</div>
            <div className="text-[10px] text-zinc-500 font-bold">REVIEWS</div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900 text-center">
            <div className="text-2xl font-extrabold text-white">{avgRating}</div>
            <div className="text-[10px] text-zinc-500 font-bold">AVG</div>
          </div>
        </div>

        {/* Top Rated */}
        {topRated.length > 0 && (
          <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
            <h3 className="text-base font-bold text-white mb-3">⭐ Top Rated</h3>
            {topRated.map(r => (
              <Link key={r.id} href={`/game/${r.game_id}`} className="block">
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-950 mb-2 hover:bg-zinc-800 transition-colors">
                  <Bdg r={parseFloat(r.rating)} />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{r.away_team} {r.away_score} — {r.home_team} {r.home_score}</div>
                    <div className="text-[10px] text-zinc-500">Wk {r.week || "?"} · {r.season || ""}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* All ratings */}
        <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800">
          <h3 className="text-base font-bold text-white mb-3">📓 All Ratings ({games})</h3>
          {ratings.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📓</div>
              <div className="text-sm text-zinc-500">No public ratings yet</div>
            </div>
          )}
          {ratings.map(r => (
            <Link key={r.id} href={`/game/${r.game_id}`} className="block">
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-950 mb-2 hover:bg-zinc-800 transition-colors">
                <Bdg r={parseFloat(r.rating)} />
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">{r.away_team} {r.away_score} — {r.home_team} {r.home_score}</div>
                  <div className="text-[10px] text-zinc-500">Wk {r.week || "?"} · {r.season || ""}</div>
                  {r.review && <div className="text-xs text-zinc-400 italic mt-1">&quot;{r.review}&quot;</div>}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {r.mvp && <span className="text-[10px] text-green-400">🌟 {r.mvp}</span>}
                    {r.watch_how && <span className="text-[10px] text-zinc-500">{r.watch_how}</span>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Nav />
    </div>
  );
}
