// World Cup "tournament skin" — a fixed, low-cost themed backdrop that sits
// behind page content (pure CSS gradients + a faint confetti motif). Pitch green
// + gold + a touch of brand red on a deep navy base. Drop <WcBackdrop /> as a
// child of any World Cup surface; it paints behind the content (-z-10) and never
// intercepts taps (pointer-events-none).
export default function WcBackdrop() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {/* base tournament gradient, fading to the app's dark base */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(168deg, #0b2a20 0%, #0a1530 42%, #09090b 76%)" }} />
      {/* colored glows: green / gold / red */}
      <div className="absolute -top-28 -left-24 w-[22rem] h-[22rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.22), transparent 70%)" }} />
      <div className="absolute -top-16 -right-20 w-[22rem] h-[22rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(234,179,8,0.18), transparent 70%)" }} />
      <div className="absolute top-1/2 left-1/4 w-[20rem] h-[20rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(220,38,38,0.13), transparent 70%)" }} />
      {/* faint confetti / halftone dots */}
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1.6px)", backgroundSize: "26px 26px" }} />
    </div>
  );
}
