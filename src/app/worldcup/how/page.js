"use client";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

function Card({ icon, title, children }) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-3">
      <h2 className="font-bold mb-2 flex items-center gap-2"><span className="text-lg">{icon}</span>{title}</h2>
      <div className="text-[13px] text-zinc-400 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}
function Scoring({ children }) {
  return (
    <div className="bg-black/30 border border-zinc-800 rounded-xl p-3 mt-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">Scoring</div>
      <div className="text-[12px] text-zinc-300 space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

export default function HowItWorksPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen pb-32">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <h1 className="text-base font-bold">How the games work</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <p className="text-[13px] text-zinc-400 mb-4">Free games for the 2026 World Cup. Lock your picks before the opening kickoff (Jun 11); points update automatically as matches play out.</p>

        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Solo or with friends</h3>

        <Card icon="🔢" title="World Cup Nations Ranking">
          <p>Rank all 48 nations from 1 to 48. Each team earns <b>performance points</b> as it plays, and you earn more for teams you ranked <b>higher</b> — so correctly backing a dark horse near the top is worth a lot.</p>
          <Scoring>
            <p>Each team&apos;s performance: <b>Win +3</b>, Draw +1, every <b>Goal +1</b>, Clean sheet +2, plus knockout bonuses (Reach R16 +4 · QF +8 · SF +12 · Final +16 · <b>Champion +25</b>).</p>
            <p className="pt-1">Your score weights each team by where you ranked it:</p>
            <p className="font-mono text-[11px] text-zinc-200 bg-zinc-900 rounded px-2 py-1">your score = Σ ( team points × weight )<br/>weight = 49 − your rank</p>
            <p>So your <b>#1</b> team counts ×48, your #2 ×47 … your #48 ×1.</p>
            <p className="text-zinc-500"><b>Example:</b> you rank Brazil #1 (weight 48) and they rack up 30 performance points → that&apos;s 48 × 30 = <b>1,440</b> to your total. The same Brazil ranked #40 (weight 9) would give only 270. Rank the teams that do well near the top.</p>
          </Scoring>
          <p className="text-zinc-500">Open to everyone (Global), or make a private league on the <b>Leagues</b> tab and name your entries.</p>
        </Card>

        <Card icon="💰" title="World Cup Salary Cap">
          <p>Build a 15-player squad under a <b>€100m budget</b> (2 GK, 5 DEF, 5 MID, 3 FWD), pick your <b>starting 11</b> on the pitch + a <b>captain</b> (double points), and order your bench. Edit freely until each round&apos;s kickoff; your team carries over between rounds (<b>transfers</b>).</p>
          <Scoring>
            <p>Per player, per match: <b>60+ min +2</b> (else +1) · <b>Goal</b> GK/DEF +6, MID +5, FWD +4 · Assist +3 · Shot on target +0.5 · Tackle +0.25 · Clean sheet (60+ min) GK/DEF +4, MID +1 · Save +1 per 3.</p>
            <p>Minus: goals conceded (GK/DEF) −1 per 2 · yellow −1 · red −3 · own goal −2.</p>
            <p><b>Captain</b> scores double. <b>Auto-subs:</b> if a starter doesn&apos;t play, your first bench sub who did takes their points.</p>
          </Scoring>
          <p className="text-zinc-500">Play the open <b>Global</b> game or make a private <b>league</b> on the Leagues tab — name your teams and the commissioner sets how many each person can enter.</p>
        </Card>

        <Card icon="⭐" title="World Cup Match Ratings">
          <p>Before kickoff, rate the <b>hype</b> 🔥. Once a game&apos;s underway, rate the <b>match 1–10</b>, drop a quick review, and score <b>every player who played</b> out of 10 — the crowd&apos;s highest-rated player is crowned 👑 <b>Star Man</b>.</p>
          <p>See community averages on the match, each player, and the hype meter; the <b>Mine</b> tab keeps your rating history.</p>
          <p className="text-zinc-500">No signup needed to browse — just your take on the football.</p>
        </Card>

        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2 mt-5">Fantasy leagues (draft with friends)</h3>
        <p className="text-[12px] text-zinc-500 mb-2">Create a private league, invite friends with a link, and draft via a <b>snake</b> (take turns) or live <b>auction</b> (nominate &amp; bid with a budget).</p>

        <Card icon="⚽" title="Player draft">
          <p>Draft a squad of individual players. Player leagues also support <b>waivers</b> — claim a free agent + drop a player, with last place getting first dibs.</p>
          <Scoring>
            <p>Same per-player scoring as Salary Cap (goals by position, assists, minutes, shots, tackles, clean sheets, saves; minus conceded/cards/own goals). Commissioners can adjust the values in <b>Settings</b>.</p>
          </Scoring>
        </Card>

        <Card icon="🏳️" title="Team draft">
          <p>Draft national teams — the 48 split evenly among managers — and earn their performance points all tournament.</p>
          <Scoring>
            <p>Per team: <b>Win +3</b>, Draw +1, Goal +1, Clean sheet +2, plus knockout bonuses (R16 +4 · QF +8 · SF +12 · Final +16 · Champion +25). Commissioners can tweak these in <b>Settings</b>.</p>
          </Scoring>
        </Card>

        <button onClick={() => router.push("/worldcup")} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl mt-2 mb-4">Start playing →</button>
      </div>
      <Nav />
    </div>
  );
}
