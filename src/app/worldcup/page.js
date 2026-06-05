"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import KickoffCountdown from "@/components/KickoffCountdown";
import WcBackdrop from "@/components/WcBackdrop";
import { WC_TEAMS_FALLBACK } from "@/lib/worldcup";
import { ui, svgIcon, IconChip } from "@/components/ui";

// Inline icon set (consistent stroke) — replaces emoji-as-icons.
const IconRank = () => (<svg {...svgIcon}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M3 20h18" /></svg>);
const IconSalary = () => (<svg {...svgIcon}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.5" /></svg>);
const IconStar = () => (<svg {...svgIcon}><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" /></svg>);
const IconUsers = () => (<svg {...svgIcon}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);

const GAMES = [
  { key: "ranking", Icon: IconRank, tint: "red", title: "Nations Ranking", href: "/worldcup/rankings", on: "View your rank on the global board", off: "Rank all 48 nations · climb the global board" },
  { key: "salary", Icon: IconSalary, tint: "emerald", title: "Salary Cap", href: "/worldcup/salary", on: "Manage your squad & check the board", off: "€100m budget · build your XI · solo or in leagues" },
  { key: "ratings", Icon: IconStar, tint: "amber", title: "Match Ratings", href: "/?tab=games", on: "Rate matches & players", off: "Rate every game 1–10, pick your Star Man" },
  { key: "leagues", Icon: IconUsers, tint: "sky", title: "Draft Leagues", href: "/worldcup/leagues", on: "Your snake & auction leagues", off: "Draft with friends — snake or live auction" },
];

// A recognizable set of flags for the hero strip (real imagery, not emoji).
const HERO_FLAGS = ["BRA", "ARG", "FRA", "ENG", "ESP", "GER", "POR", "NED", "USA", "MEX", "BEL", "CRO", "URU", "JPN", "MAR", "SEN"]
  .map((ab) => WC_TEAMS_FALLBACK.find((t) => t.abbr === ab)).filter(Boolean);

export default function WorldCupHub() {
  const { user } = useAuth();
  const router = useRouter();
  const [myStatus, setMyStatus] = useState({ salary: false, ranking: false, leagues: false });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [sal, rank, lg] = await Promise.all([
        sbJson(await sbFetch(`wc_salary_entries?user_id=eq.${user.id}&select=id&limit=1`)),
        sbJson(await sbFetch(`wc_ranking_entries?user_id=eq.${user.id}&select=id&limit=1`)),
        sbJson(await sbFetch(`wc_members?user_id=eq.${user.id}&select=league_id&limit=1`)),
      ]);
      setMyStatus({ salary: sal.length > 0, ranking: rank.length > 0, leagues: lg.length > 0 });
    })().catch(() => {});
  }, [user]);

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className={ui.header}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center text-base shrink-0">🩸</div>
          <div>
            <h1 className="text-base font-extrabold leading-tight tracking-tight">The Nosebleeds</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Fantasy World Cup 2026</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl mb-6 border border-red-500/25 bg-gradient-to-br from-red-700 via-red-800 to-zinc-950 shadow-xl shadow-red-900/20">
          <div className="flex gap-2.5 px-4 pt-4 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)" }}>
            {HERO_FLAGS.map((t) => (
              <img key={t.id} src={t.logo} alt="" className="w-7 h-7 object-contain shrink-0 drop-shadow" loading="lazy" />
            ))}
          </div>
          <div className="px-6 pb-6 pt-3 text-center">
            <h2 className="text-[26px] font-extrabold text-white tracking-tight leading-[1.12]">Your group chat&apos;s home for the World Cup</h2>
            <p className="text-[12.5px] text-red-100/85 mt-2.5 mb-4 max-w-md mx-auto leading-relaxed">Rank the nations, build a salary-cap squad, draft with friends &amp; rate every match — all free.</p>
            <KickoffCountdown variant="hero" />
            <p className="text-[10px] text-red-200/60 mt-2">until kickoff · June 11</p>
            <button onClick={() => router.push("/worldcup/how")} className="text-[12px] text-white/85 underline underline-offset-2 mt-2.5 inline-block">How the games &amp; scoring work →</button>
          </div>
        </div>

        {/* Games */}
        <div className="grid gap-3 mb-6">
          {GAMES.map((g) => {
            const entered = myStatus[g.key];
            return (
              <button key={g.key} onClick={() => router.push(g.href)}
                className={`w-full text-left ${ui.card} ${ui.cardHover} px-4 py-4 flex items-center gap-3.5`}>
                <IconChip tint={g.tint}><g.Icon /></IconChip>
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    {g.title}
                    {entered && <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5">✓ in</span>}
                  </div>
                  <div className="text-[12px] text-zinc-400 leading-snug">{entered ? g.on : g.off}</div>
                </div>
                <span className="text-zinc-600 text-lg">›</span>
              </button>
            );
          })}
        </div>

        {!user && (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-5 py-6 text-center">
            <p className="text-white font-bold mb-1">New here? Welcome 👋</p>
            <p className="text-[13px] text-zinc-400 mb-4 max-w-sm mx-auto">Tap any game above to look around. Log in to save your picks, create private leagues, and invite your friends.</p>
            <button onClick={() => router.push("/login")} className={`${ui.btnPrimary} px-6 py-2.5 shadow-lg shadow-red-900/30`}>Log in / sign up</button>
          </div>
        )}
      </div>

      <Nav />
    </div>
  );
}
