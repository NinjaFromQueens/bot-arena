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
  // this device's reading level (the mission page has the switch)
  function current() {
    try { const t = JSON.parse(localStorage.getItem("cr-tier")); return LEVELS.includes(t) ? t : "recruit"; } catch { return "recruit"; }
  }
  // this device's choice (the class setting will win over it once teachers can set one)
  function set(t) { if (LEVELS.includes(t)) try { localStorage.setItem("cr-tier", JSON.stringify(t)); } catch {} }
  return { LEVELS, isTiered, text, current, set };
});
