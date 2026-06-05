"use client";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

function Section({ icon, title, children }) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-3">
      <h2 className="font-bold mb-1.5 flex items-center gap-2"><span className="text-lg">{icon}</span>{title}</h2>
      <div className="text-[13px] text-zinc-400 space-y-1.5 leading-relaxed">{children}</div>
    </div>
  );
}

export default function HowItWorksPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <h1 className="text-base font-bold">How the games work</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <p className="text-[13px] text-zinc-400 mb-4">
          Four ways to play the World Cup with friends — all free. Lock your picks before the opening kickoff (Jun 11); points update automatically as matches play out.
        </p>

        <Section icon="🔢" title="Power Ranking">
          <p>Rank all 48 nations 1→48. Each team earns <b>performance points</b> as it plays, and you score more for teams you ranked <b>higher</b> — so nailing a dark horse near the top pays off big.</p>
          <p>Open to everyone with a global leaderboard; make a <b>group</b> from the Leaderboard tab to compete with friends.</p>
        </Section>

        <Section icon="💰" title="Salary Cap">
          <p>Build a 15-player squad under a <b>€100m budget</b> (2 GK, 5 DEF, 5 MID, 3 FWD), pick your <b>starting 11</b> + a <b>captain</b> (double points), and order your bench.</p>
          <p><b>Auto-subs:</b> if a starter doesn&apos;t play, your first bench sub who did takes their place. <b>Transfers:</b> change your team freely before each round&apos;s first kickoff — it carries over otherwise.</p>
        </Section>

        <Section icon="🏆" title="Draft leagues (with friends)">
          <p>Create a private league and draft <b>nations</b> or <b>players</b>, via a <b>snake</b> draft (take turns) or a live <b>auction</b> (nominate &amp; bid with a budget). Commissioner sets the size.</p>
          <p><b>Waivers</b> (player leagues): claim a free agent + drop a player — last place gets first dibs, processed daily.</p>
        </Section>

        <Section icon="📊" title="Scoring">
          <p><b>Players</b> earn: minutes, goals (more for defenders/keepers), assists, shots on target, tackles, saves, and clean sheets — and lose points for goals conceded (DEF/MID), cards, and own goals.</p>
          <p><b>Teams</b> earn: win/draw, goals scored, clean sheets, and bonuses for advancing each knockout round (R16 → Champion).</p>
          <p className="text-zinc-500 text-[12px]">“Proj” next to a player is a pre-tournament projection from their recent international form.</p>
        </Section>

        <button onClick={() => router.push("/worldcup")} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl mt-2">
          Start playing →
        </button>
      </div>
      <Nav />
    </div>
  );
}
