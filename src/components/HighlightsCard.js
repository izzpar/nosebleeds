"use client";
import { useState, useEffect } from "react";

// Finished games: asks /api/highlights for the exact highlight video and, when
// the server finds one (needs YOUTUBE_API_KEY), plays it in place. Otherwise
// it's a link card that opens YouTube. `href` is the /api/highlights URL.
export default function HighlightsCard({ href, title, subtitle }) {
  const [found, setFound] = useState({ videoId: null, url: href });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFound({ videoId: null, url: href });
    setPlaying(false);
    fetch(`${href}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.url) return;
        // A known URL (the video, or the search page) saves a second lookup on tap.
        setFound({ videoId: /^[\w-]{11}$/.test(d.videoId || "") ? d.videoId : null, url: d.url });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [href]);

  if (found.videoId) {
    const id = found.videoId;
    return (
      <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3">
        <div className="relative aspect-video bg-black">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`}
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <button onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="group absolute inset-0 w-full h-full">
              <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                <span className="w-16 h-11 rounded-xl bg-red-600 flex items-center justify-center text-white text-2xl shadow-lg">▶</span>
              </span>
            </button>
          )}
        </div>
        <div className="px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white truncate">{title}</span>
            <span className="block text-xs text-zinc-500 truncate">{subtitle}</span>
          </span>
          <a href={found.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-zinc-400 hover:text-red-400">YouTube ↗</a>
        </div>
      </div>
    );
  }

  return (
    <a href={found.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-3 hover:-translate-y-0.5 transition-transform">
      <div className="w-12 h-9 rounded-lg bg-red-600 flex items-center justify-center text-xl shrink-0" aria-hidden="true">▶</div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
      </div>
    </a>
  );
}
