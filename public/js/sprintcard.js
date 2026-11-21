/*
 * Speed Run's pictures and answer text, for the board (speedrun.js) and students' game pages (play.js). Browser only
 * (window.SprintCard). The pictures are the teaching layer (game standard A5): drawn by code from the problem's own
 * numbers, in the UI colors. Force arrows are to scale, so Cadets can compare them without reading numbers.
 */
(function () {
  const ORANGE = "#f46524", BLUE = "#3aa0ff", INK = "#141316", BODY = "#5d6a7a", BODY_HI = "#7f8da0";
  const KIND = { liftOrNot: "Lift or not", enoughNozzles: "Which car lifts off", weight: "Weight", nozzlesNeeded: "Nozzles needed", thrustToWeight: "Thrust ÷ weight",
    nozzlesForMargin: "Nozzles for a margin", netForce: "Net force", acceleration: "Acceleration", burnTime: "Burn time" };
  const fmt = (n, dp = 0) => { const [i, f] = Math.abs(n).toFixed(dp).split("."); return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); };

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 480, h = canvas.clientHeight || 220;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // a flying car, side view, centered on (cx, cy), s wide; n lift nozzles drawn under it
  function car(ctx, cx, cy, s, n) {
    const h = s * 0.3, x = cx - s / 2, y = cy - h / 2;
    for (let k = 0; k < (n || 0); k++) { // nozzles: small orange cones under the body, spread evenly
      const nx = x + s * 0.12 + ((s * 0.76) * (k + 0.5)) / n;
      ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.moveTo(nx - s * 0.025, y + h); ctx.lineTo(nx + s * 0.025, y + h); ctx.lineTo(nx, y + h + s * 0.06); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = BODY; rrect(ctx, x, y, s, h, h * 0.35); ctx.fill();
    ctx.fillStyle = BODY_HI; rrect(ctx, x + s * 0.28, y - h * 0.45, s * 0.42, h * 0.6, h * 0.25); ctx.fill(); // cabin
    ctx.fillStyle = "#bfe3ff"; rrect(ctx, x + s * 0.34, y - h * 0.32, s * 0.3, h * 0.36, h * 0.15); ctx.fill(); // window
    ctx.fillStyle = INK; [x + s * 0.2, x + s * 0.8].forEach((wx) => { ctx.beginPath(); ctx.arc(wx, y + h, h * 0.32, 0, 7); ctx.fill(); });
  }
  function arrow(ctx, x, y1, y2, color, width) {
    const dir = Math.sign(y2 - y1) || 1, head = Math.min(width * 2.4, Math.abs(y2 - y1) * 0.45);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2 - dir * head); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - head * 0.75, y2 - dir * head); ctx.lineTo(x + head * 0.75, y2 - dir * head); ctx.lineTo(x, y2); ctx.closePath(); ctx.fill();
  }
  function label(ctx, text, x, y, color, size, align) {
    ctx.font = `700 ${size}px 'Barlow Semi Condensed', sans-serif`; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y);
  }
  // push up (orange) and weight down (blue), to the same scale
  function forceArrows(ctx, w, h, p) {
    const cx = w / 2, cy = h / 2, s = Math.min(w * 0.34, h * 0.7), big = Math.max(p.up, p.down), room = h * 0.4, k = room / big, lw = Math.max(4, s * 0.05);
    car(ctx, cx, cy, s, 0);
    arrow(ctx, cx, cy - s * 0.2, cy - s * 0.2 - p.up * k, ORANGE, lw);
    arrow(ctx, cx, cy + s * 0.16, cy + s * 0.16 + p.down * k, BLUE, lw);
    const size = Math.max(14, Math.min(22, w / 26));
    label(ctx, "push up", cx + lw * 2, cy - s * 0.2 - p.up * k * 0.6, ORANGE, size);
    label(ctx, "weight", cx + lw * 2, cy + s * 0.16 + p.down * k * 0.6, BLUE, size);
  }
  // two of the same car with different numbers of lift nozzles
  function twoCars(ctx, w, h, p) {
    const s = Math.min(w * 0.36, h * 0.9), size = Math.max(14, Math.min(22, w / 26));
    p.nozzles.forEach((n, i) => {
      const cx = w * (i ? 0.73 : 0.27), cy = h * 0.45;
      car(ctx, cx, cy, s, n);
      label(ctx, `${n} nozzles`, cx, h * 0.88, "#e8e6ec", size, "center");
    });
  }
  function draw(canvas, pic) {
    if (!canvas || !pic) return false;
    const { ctx, w, h } = fit(canvas);
    if (pic.kind === "forceArrows") forceArrows(ctx, w, h, pic);
    else if (pic.kind === "twoCars") twoCars(ctx, w, h, pic);
    else return false;
    return true;
  }
  // a value as the student would have typed or picked it: the choice's label, or the bare number (a mistake like the
  // mass, or kilonewtons, isn't in the answer's unit, so it never gets one)
  function valueText(problem, value) {
    if (problem.input.kind === "choice") return (problem.input.options.find((o) => String(o.value) === String(value)) || {}).label || String(value);
    const dp = Number.isInteger(value) ? 0 : Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? 1 : 2;
    return fmt(value, dp);
  }
  // the answer as words: the choice's label, or the number with its unit
  function answerText(problem, answer) {
    const unit = problem.input.kind === "choice" ? "" : problem.input.unit;
    return valueText(problem, answer.value) + (unit ? " " + unit : "");
  }
  window.SprintCard = { draw, answerText, valueText, KIND, fmt };
})();
