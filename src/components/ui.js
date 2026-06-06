// Central look-and-feel for the World Cup surfaces.
// Edit the tokens here to restyle the app fast — pages import these instead of
// repeating Tailwind class strings everywhere. (Want a lighter theme later? Mostly
// a matter of changing `page`, `card`, `input`, and the chip tints below.)

export const ui = {
  page: "min-h-screen pb-24",
  header: "sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800",
  card: "bg-zinc-900/80 border border-zinc-800 rounded-2xl",
  cardHover: "hover:border-zinc-700 hover:bg-zinc-900 transition-all active:scale-[0.99]",
  input: "w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-600 placeholder:text-zinc-500",
  btnPrimary: "bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold rounded-xl",
  btnGhost: "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold rounded-xl",
  muted: "text-zinc-400",
  faint: "text-zinc-500",
  // soft tinted backgrounds for icon chips, badges, etc.
  tint: {
    red: "bg-red-500/15 text-red-400",
    emerald: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
    sky: "bg-sky-500/15 text-sky-400",
  },
};

// Consistent stroke icon wrapper props — spread onto an <svg>.
export const svgIcon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className: "w-5 h-5" };

// A small, consistent stroke-icon set (Lucide-style geometry) so the app uses
// real icons instead of emoji in functional UI. Add new glyphs here, reference
// them by name with <Icon name="…" />.
const ICONS = {
  scores: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22" /><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5.5 21a7.5 7.5 0 0 1 13 0" /></>,
  login: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" /></>,
  ranking: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" /><path d="M16 12h.01" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  star: <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 2 }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>{glyph}</svg>;
}

export function IconChip({ tint = "red", className = "", children }) {
  return <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${ui.tint[tint] || ui.tint.red} ${className}`}>{children}</div>;
}

export function SectionLabel({ children, className = "" }) {
  return <h2 className={`text-xs font-bold uppercase tracking-wide text-zinc-500 ${className}`}>{children}</h2>;
}
