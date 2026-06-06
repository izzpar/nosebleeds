// World Cup "tournament skin" — a fixed, low-cost themed backdrop behind page
// content. Uses soft radial gradients (NOT filter: blur) so it stays cheap on
// mobile GPUs: large blur() layers on fixed elements crash iOS Safari on long
// scrolls (out of memory). Pure paint, never intercepts taps.
export default function WcBackdrop() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        background: [
          "radial-gradient(42rem 42rem at 10% -8%, rgba(16,185,129,0.18), transparent 60%)",
          "radial-gradient(40rem 40rem at 94% 0%, rgba(234,179,8,0.13), transparent 60%)",
          "radial-gradient(36rem 36rem at 26% 50%, rgba(220,38,38,0.10), transparent 62%)",
          "linear-gradient(168deg, #0b2a20 0%, #0a1530 42%, #09090b 76%)",
        ].join(", "),
      }}
    />
  );
}
