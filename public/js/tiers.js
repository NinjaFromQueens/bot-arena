/* Reading levels (tiers): Cadet (grades 1–3), Recruit (4–8), Operative (9–12). Shared by the browser, the server and
 * the tests. Text in lessons, missions and problem sets is either one value for every tier or
 * { cadet, recruit, operative }; a tier that isn't written yet falls back to the Recruit text. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Tier = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const LEVELS = ["cadet", "recruit", "operative"];
  const isTiered = (v) => v != null && typeof v === "object" && !Array.isArray(v) && LEVELS.some((t) => t in v);
  function text(v, tier) {
    if (!isTiered(v)) return v;
    return v[tier] != null ? v[tier] : v.recruit;
  }
  // the class's reading level when the teacher set one: the game page saves it with the game's code, and it counts only
  // while this device's game pass is for that game (so an old game's setting never sticks)
  function classTier() {
    try {
      const c = JSON.parse(localStorage.getItem("cr-class-tier")), s = JSON.parse(localStorage.getItem("ba-session"));
      return c && s && c.code === s.code && LEVELS.includes(c.tier) ? c.tier : null;
    } catch { return null; }
  }
  function setClass(code, tier) {
    try { if (code && LEVELS.includes(tier)) localStorage.setItem("cr-class-tier", JSON.stringify({ code, tier })); else localStorage.removeItem("cr-class-tier"); } catch {}
  }
  // this device's reading level: the class's when the teacher set one, otherwise the device's own choice, otherwise Recruit
  function current() {
    const c = classTier(); if (c) return c;
    try { const t = JSON.parse(localStorage.getItem("cr-tier")); return LEVELS.includes(t) ? t : "recruit"; } catch { return "recruit"; }
  }
  // this device's own choice (the class setting wins over it)
  function set(t) { if (LEVELS.includes(t)) try { localStorage.setItem("cr-tier", JSON.stringify(t)); } catch {} }
  return { LEVELS, isTiered, text, current, set, classTier, setClass };
});
