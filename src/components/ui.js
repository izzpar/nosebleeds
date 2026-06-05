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

export function IconChip({ tint = "red", className = "", children }) {
  return <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${ui.tint[tint] || ui.tint.red} ${className}`}>{children}</div>;
}

export function SectionLabel({ children, className = "" }) {
  return <h2 className={`text-xs font-bold uppercase tracking-wide text-zinc-500 ${className}`}>{children}</h2>;
}
