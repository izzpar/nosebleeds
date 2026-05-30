"use client";
import Link from "next/link";
import Nav from "@/components/Nav";
import { DROPS, EMOTE_PACKS, NAME_FLAIR } from "@/lib/drops";
import { REP, REP_TIERS } from "@/lib/reputation";

function Section({ emoji, title, children }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-4">
      <h2 className="text-lg font-extrabold text-white mb-2 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h2>
      <div className="text-sm text-zinc-400 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">How It Works</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-6 mb-4 text-center">
          <div className="text-5xl mb-2">🩸</div>
          <div className="text-2xl font-extrabold text-white">The Nosebleeds</div>
          <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
            Letterboxd, but for sports. Rate and review every game you watch, track your
            history, and see what the community thinks — across NFL, MLB, NBA, NHL, and tennis.
          </p>
        </div>

        <Section emoji="⭐" title="Rate every game">
          <p>
            After a game, give it a score from <strong className="text-white">1 to 10</strong> for how
            good a watch it was. Add a review, tag the MVP and the biggest letdown, note how you
            watched it, and say whether it was worth it. Everything you rate builds your personal
            <Link href="/?tab=diary" className="text-red-400"> diary</Link>.
          </p>
          <p>
            Every game shows a <strong className="text-white">community average</strong> and a
            rating distribution, so you can see if your take is hot or cold. Rate something 3+ points
            off the consensus and you'll earn a <span className="text-orange-400 font-bold">🌶️ Hot Take</span> badge.
          </p>
        </Section>

        <Section emoji="🏀" title="Five sports, your way">
          <p>
            Switch between <strong className="text-white">🏈 NFL · ⚾ MLB · 🏀 NBA · 🏒 NHL · 🎾 Tennis</strong>{" "}
            up top. Set your favorite team in each, and use fandom filters to see how home fans,
            away fans, and neutrals rated a game differently.
          </p>
        </Section>

        <Section emoji="🙌" title="Rooting & predictions">
          <p>
            Before a game, tap <strong className="text-white">who you're rooting for</strong> and watch the
            live fan split. Head to the <Link href="/predictions" className="text-red-400">Predict tab</Link> to
            call winners and against-the-spread picks, climb the leaderboards, or play{" "}
            <strong className="text-white">Beat the Streak</strong> — pick one MLB hitter a day to get a hit and
            see how long you can keep the streak alive.
          </p>
        </Section>

        {/* Drops */}
        <Section emoji="🩸" title="Drops — the currency">
          <p>
            <strong className="text-white">Drops</strong> are what you earn for being active. Spend them
            in the store on your <Link href="/?tab=profile" className="text-red-400">profile</Link>.
          </p>
          <div className="grid grid-cols-3 gap-2 my-3">
            {[
              { n: `+${DROPS.perRating}`, l: "per rating" },
              { n: `+${DROPS.perReview}`, l: "per review" },
              { n: `+${DROPS.perLike}`, l: "per like received" },
            ].map((x) => (
              <div key={x.l} className="rounded-xl bg-zinc-950 p-3 text-center">
                <div className="text-xl font-extrabold text-red-400">{x.n}</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{x.l}</div>
              </div>
            ))}
          </div>
          <p className="font-bold text-white">Spend them on:</p>
          <ul className="space-y-1">
            {EMOTE_PACKS.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.emoji} {p.name} <span className="text-zinc-600">— extra comment reactions</span></span>
                <span className="text-zinc-500 font-bold shrink-0">🩸{p.cost}</span>
              </li>
            ))}
            {NAME_FLAIR.map((f) => (
              <li key={f.id} className="flex items-center justify-between">
                <span style={{ color: f.color }} className="font-bold">{f.name} name color</span>
                <span className="text-zinc-500 font-bold shrink-0">🩸{f.cost}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Reputation */}
        <Section emoji="🏅" title="Reputation (Cred)">
          <p>
            <strong className="text-white">Cred</strong> is your permanent standing in the community.
            Unlike Drops, you can't spend it — it just reflects how much you contribute and how much
            people value your takes. Earn it from:
          </p>
          <div className="grid grid-cols-5 gap-1.5 my-3 text-center">
            {[
              { n: `+${REP.perRating}`, l: "Rating" },
              { n: `+${REP.perReview}`, l: "Review" },
              { n: `+${REP.perComment}`, l: "Comment" },
              { n: `+${REP.perLikeReceived}`, l: "Like" },
              { n: `+${REP.perFollower}`, l: "Follower" },
            ].map((x) => (
              <div key={x.l} className="rounded-lg bg-zinc-950 p-2">
                <div className="text-sm font-extrabold text-white">{x.n}</div>
                <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide">{x.l}</div>
              </div>
            ))}
          </div>
          <p>As your Cred grows you climb the tiers — shown on your profile and next to your comments:</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {REP_TIERS.map((t) => (
              <span key={t.name} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: t.color + "22", color: t.color }}>
                {t.emoji} {t.name} <span className="opacity-70">{t.min}+</span>
              </span>
            ))}
          </div>
          <p className="mt-2">Top members rank on the <Link href="/leaderboard" className="text-red-400">🏅 Rep leaderboard</Link>.</p>
        </Section>

        <Section emoji="🔥" title="Streaks, badges & more">
          <p>
            Rate at least one game a day to build a <strong className="text-white">rating streak</strong>.
            Unlock <strong className="text-white">achievement badges</strong> for milestones — your first log,
            rating all five sports, writing reviews, hitting reputation tiers, and more. Follow other
            fans to get their ratings in your <Link href="/?tab=friends" className="text-red-400">feed</Link> and
            notifications, and compare your <strong className="text-white">taste match</strong> on their profile.
          </p>
        </Section>

        <Section emoji="📊" title="Discover & recaps">
          <p>
            The <Link href="/?tab=discover" className="text-red-400">Discover tab</Link> surfaces hot games,
            the highest-rated of all time, and the <strong className="text-white">most divisive</strong> games the
            community can't agree on. Daily recaps round up the best games, top performers, and biggest
            letdowns for each day.
          </p>
        </Section>

        <div className="text-center py-4">
          <Link href="/?tab=games" className="inline-block px-8 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors">
            Start rating →
          </Link>
          <div className="text-[10px] text-zinc-600 mt-4">The Nosebleeds · made for fans who watch everything</div>
        </div>
      </div>

      <Nav />
    </div>
  );
}
