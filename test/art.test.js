// Art packs: the sample pack (and public/art/, if a school installed one) must name real parts, with boxes and files that exist.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require("../public/js/engine.js");

function checkPack(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert(m.parts && typeof m.parts === "object", `${dir}: manifest needs "parts"`);
  for (const [key, p] of Object.entries(m.parts)) {
    const [slot, n] = key.split(".");
    assert(["body", "sensor", "tool"].includes(slot) && /^\d$/.test(n) && E.PARTS[slot][+n], `${dir}: "${key}" isn't a part (body.0-${E.PARTS.body.length - 1}, sensor.0-${E.PARTS.sensor.length - 1}, tool.0-${E.PARTS.tool.length - 1})`);
    assert(Array.isArray(p.box) && p.box.length === 4 && p.box.every(Number.isFinite) && p.box[2] > 0 && p.box[3] > 0, `${dir}: "${key}" needs a box [x, y, width, height]`);
    assert(fs.existsSync(path.join(dir, p.src)), `${dir}: "${key}" points to ${p.src}, which isn't there`);
    if (slot === "body") assert(Math.abs(p.box[1] + p.box[3]) < 0.05, `${dir}: "${key}" should sit on the ground (y + height = 0)`);
  }
  return Object.keys(m.parts).length;
}
const n = checkPack(path.join(__dirname, "../public/art-sample"));
const live = path.join(__dirname, "../public/art");
const m = fs.existsSync(path.join(live, "manifest.json")) ? checkPack(live) : 0;
assert(typeof E.setArt === "function" && typeof E.loadArt === "function", "engine exposes setArt/loadArt");
console.log(`Art tests passed (sample pack: ${n} parts${m ? `, installed pack: ${m} parts` : ""})`);
