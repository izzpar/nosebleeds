// Renders a square "rating card" PNG on a <canvas> for sharing. Uses team
// colors + text only (no external logo images) so the canvas never gets
// tainted by cross-origin assets and toBlob() always works.

function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d";
  if (n === 2) return "#dc2626";
  if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c";
  if (n === 5) return "#fbbf24";
  if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635";
  if (n === 8) return "#4ade80";
  if (n === 9) return "#22c55e";
  return "#15803d";
}

// Draw text shrinking the font until it fits maxWidth.
function fitText(ctx, text, x, y, maxWidth, startPx, weight = "800", family = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif") {
  let size = startPx;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= 16) break;
    size -= 2;
  } while (size > 16);
  ctx.fillText(text, x, y);
  return size;
}

function disc(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// opts: { title, leftLabel, leftScore, leftColor, rightLabel, rightScore,
//         rightColor, rating, ratingLabel, handle }
export async function makeRatingCard(opts) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const fam = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  // Background
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, W, H);
  // Top accent bar (left color → right color)
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, opts.leftColor || "#dc2626");
  grad.addColorStop(1, opts.rightColor || "#dc2626");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 16);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Branding: red drop + wordmark
  disc(ctx, W / 2 - 215, 104, 16, "#dc2626");
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 52px ${fam}`;
  ctx.fillText("THE NOSEBLEEDS", W / 2 + 18, 120);

  // Subtitle / title
  if (opts.title) {
    ctx.fillStyle = "#a1a1aa";
    ctx.font = `600 30px ${fam}`;
    ctx.fillText(opts.title.toUpperCase(), W / 2, 180);
  }

  // Matchup — two sides
  const leftX = 290, rightX = 790, discY = 380, dr = 96;
  disc(ctx, leftX, discY, dr, opts.leftColor || "#3f3f46");
  disc(ctx, rightX, discY, dr, opts.rightColor || "#3f3f46");
  ctx.fillStyle = "#ffffff";
  fitText(ctx, opts.leftLabel || "", leftX, discY + 22, dr * 1.6, 60, "800", fam);
  fitText(ctx, opts.rightLabel || "", rightX, discY + 22, dr * 1.6, 60, "800", fam);
  // Scores
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 96px ${fam}`;
  if (opts.leftScore != null) ctx.fillText(String(opts.leftScore), leftX, discY + 230);
  if (opts.rightScore != null) ctx.fillText(String(opts.rightScore), rightX, discY + 230);
  // vs divider
  ctx.fillStyle = "#52525b";
  ctx.font = `700 36px ${fam}`;
  ctx.fillText("—", W / 2, discY + 14);

  // Rating disc
  const ratingY = 740, ratingR = 128;
  disc(ctx, W / 2, ratingY, ratingR, rc(opts.rating));
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 128px ${fam}`;
  ctx.fillText(String(opts.rating), W / 2, ratingY + 44);
  if (opts.ratingLabel) {
    ctx.fillStyle = rc(opts.rating);
    ctx.font = `800 40px ${fam}`;
    ctx.fillText(opts.ratingLabel, W / 2, ratingY + ratingR + 64);
  }

  // Handle
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `600 32px ${fam}`;
  ctx.fillText(opts.handle ? `@${opts.handle} rated this` : "rated on thenosebleeds.app", W / 2, H - 56);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return { blob, dataUrl: canvas.toDataURL("image/png") };
}

// Text-only "Dream Team" share card (no external images → never taints the canvas).
// opts: { title, accent, slots: [{ pos, name }], handle }
export async function makeLineupCard(opts) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const fam = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const accent = opts.accent || "#dc2626";

  ctx.fillStyle = "#0a0a0c"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 16);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  disc(ctx, W / 2 - 215, 96, 15, "#dc2626");
  ctx.fillStyle = "#fff"; ctx.font = `800 48px ${fam}`;
  ctx.fillText("THE NOSEBLEEDS", W / 2 + 14, 110);
  ctx.fillStyle = accent; ctx.font = `800 38px ${fam}`;
  ctx.fillText((opts.title || "MY DREAM TEAM").toUpperCase(), W / 2, 168);

  const slots = opts.slots || [];
  const top = 230;
  const rowH = Math.min(78, Math.floor((H - top - 120) / Math.max(slots.length, 1)));
  ctx.textAlign = "left";
  slots.forEach((s, i) => {
    const y = top + i * rowH;
    // position chip
    ctx.fillStyle = "#18181b"; ctx.fillRect(80, y, 980, rowH - 12);
    ctx.fillStyle = accent; ctx.fillRect(80, y, 8, rowH - 12);
    ctx.fillStyle = "#71717a"; ctx.font = `800 26px ${fam}`;
    ctx.fillText((s.pos || "").toUpperCase(), 110, y + (rowH - 12) / 2 + 9);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.min(40, rowH - 28)}px ${fam}`;
    const name = s.name || "—";
    let size = Math.min(40, rowH - 28);
    do { ctx.font = `700 ${size}px ${fam}`; if (ctx.measureText(name).width <= 720 || size <= 20) break; size -= 2; } while (size > 20);
    ctx.fillText(name, 230, y + (rowH - 12) / 2 + size / 3);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#a1a1aa"; ctx.font = `600 30px ${fam}`;
  ctx.fillText(opts.handle ? `@${opts.handle} · build yours at thenosebleeds.app` : "build yours at thenosebleeds.app", W / 2, H - 50);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return { blob, dataUrl: canvas.toDataURL("image/png") };
}
