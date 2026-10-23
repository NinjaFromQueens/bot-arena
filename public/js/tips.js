/*
 * Tooltips for every page. Put data-tip="..." on any element (a "\n" starts a new line).
 * Mouse: hover. Keyboard: focus. Touch: a tap shows the tip for a few seconds, and the tap still works as normal.
 * Carries its own styles so it also works in practice mode and the offline backups.
 */
(function () {
  const css = `
  .tipbub { position: fixed; z-index: 1000; left: 0; top: 0; max-width: min(290px, calc(100vw - 12px)); padding: 8px 11px; border-radius: 9px;
    background: #0f0e11; color: #f4f1ea; border: 1px solid #5a5762; box-shadow: 0 8px 24px rgba(0,0,0,.55);
    font: 500 14px/1.35 "Barlow Semi Condensed", "Arial Narrow", Arial, sans-serif; letter-spacing: 0; text-transform: none; text-align: left;
    white-space: pre-line; pointer-events: none; opacity: 0; transform: translateY(4px); transition: opacity .12s, transform .12s; }
  .tipbub.on { opacity: 1; transform: none; }
  .tipbub::after { content: ""; position: absolute; left: var(--ax, 50%); top: 100%; width: 10px; height: 10px; background: inherit;
    border-right: 1px solid #5a5762; border-bottom: 1px solid #5a5762; transform: translate(-50%, -5px) rotate(45deg); }
  .tipbub.below::after { top: auto; bottom: 100%; transform: translate(-50%, 5px) rotate(225deg); }
  .hastip { text-decoration: underline dotted rgba(255,255,255,.45); text-underline-offset: 3px; cursor: help; }
  @media (prefers-reduced-motion: reduce) { .tipbub { transition: none; } }`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  let bub = null, cur = null, showT = 0, hideT = 0, byTouch = false;
  function bubble() {
    if (!bub) { bub = document.createElement("div"); bub.className = "tipbub"; bub.id = "tipbub"; bub.setAttribute("role", "tooltip"); document.body.appendChild(bub); }
    return bub;
  }
  function show(t) {
    const text = t.getAttribute("data-tip");
    if (!text || !t.isConnected) return;
    const b = bubble(); hide(); cur = t;
    b.textContent = text; b.classList.remove("on", "below"); b.style.left = "0px"; b.style.top = "0px";
    const r = t.getBoundingClientRect(), bw = b.offsetWidth, bh = b.offsetHeight, W = document.documentElement.clientWidth;
    let top = r.top - bh - 9, below = false;
    if (top < 6) { top = r.bottom + 9; below = true; }
    const left = Math.max(6, Math.min(W - bw - 6, r.left + r.width / 2 - bw / 2));
    b.style.left = left + "px"; b.style.top = top + "px";
    b.style.setProperty("--ax", Math.max(12, Math.min(bw - 12, r.left + r.width / 2 - left)) + "px");
    b.classList.toggle("below", below); b.classList.add("on");
    t.setAttribute("aria-describedby", "tipbub");
  }
  function hide() {
    clearTimeout(showT); clearTimeout(hideT);
    if (cur) cur.removeAttribute("aria-describedby");
    cur = null; byTouch = false; if (bub) bub.classList.remove("on");
  }
  const tipOf = (e) => (e.target && e.target.closest ? e.target.closest("[data-tip]") : null);

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const t = tipOf(e); if (!t || t === cur) return;
    clearTimeout(showT); showT = setTimeout(() => show(t), 280);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    const t = tipOf(e); if (!t || (e.relatedTarget && t.contains(e.relatedTarget))) return;
    clearTimeout(showT); if (t === cur) hide();
  });
  document.addEventListener("pointerdown", (e) => {
    const t = tipOf(e);
    if (e.pointerType !== "touch" || !t) { hide(); return; } // a click hides the tip so it never covers the result
    show(t); byTouch = true; hideT = setTimeout(hide, 3500);
  }, true);
  document.addEventListener("focusin", (e) => { const t = tipOf(e); if (t && t.matches(":focus-visible")) show(t); });
  // a tapped button often gets redrawn (part pickers), which drops focus; the touch timer hides those tips instead
  document.addEventListener("focusout", (e) => { if (!byTouch && tipOf(e) === cur) hide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  // only when the scrolling area holds the tipped element (the battle log scrolls on its own during fights)
  window.addEventListener("scroll", (e) => { if (cur && (e.target === document || (e.target.contains && e.target.contains(cur)))) hide(); }, true);
  window.addEventListener("resize", hide);
})();
