/*
 * The story's sound for games and labs (ECHO-2; game standard S1–S4). Browser only: window.StorySound.
 * - Off by default (S1): a page's Sound button turns it on, and the choice is the story player's (cr-story-sound).
 * - Loops (music, ambience) and effects are a path under /assets/ or an asset ID from story-assets.json; an ID not made
 *   yet falls back to its stand-in path, then to a synthesized sound, so a page never waits for audio.
 * - Volt's beeps by feeling are the story player's square-wave beeps (Volt only beeps in Episode 1).
 * StorySound.init(assets) · loop(name, ref, {stand, vol}) · play(ref, {stand, synth, vol, max}) · synth(name) · beep(feel)
 * · button(el) · on
 */
(function () {
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const VOL = { music: 0.42, ambience: 0.3, sfx: 0.5 }; // the tour's and the story player's levels
  const BEEPS = {
    happy: [[660, 0.09], [880, 0.09], [1100, 0.15]], sad: [[620, 0.2], [500, 0.2], [380, 0.32]],
    curious: [[700, 0.09], [920, 0.09], [660, 0.09], [1040, 0.17]], scared: [[900, 0.05], [960, 0.05], [900, 0.05], [960, 0.05]],
    excited: [[880, 0.06], [1100, 0.06], [1320, 0.06], [1100, 0.06], [1320, 0.13]], thinking: [[500, 0.14], [0, 0.08], [530, 0.14], [0, 0.08], [570, 0.2]],
  };
  let A = {}, on = store.get("cr-story-sound") === "1", actx = null;
  const loops = {}, buttons = [];
  const resolve = (ref) => (!ref ? null : ref.startsWith("/") ? ref : (A[ref] && A[ref].made && A[ref].file) || null);
  const start = (a) => { const p = a.play(); if (p && p.catch) p.catch(() => {}); };
  function ctx() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    if (!actx) actx = new AC(); if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function fade(a, to, secs, done) {
    clearInterval(a._f); const from = a.volume, t0 = performance.now();
    a._f = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / (secs * 1000)); a.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k >= 1) { clearInterval(a._f); if (done) done(); } }, 40);
  }

  // a looping bed: plays while sound is on, fades in and out with the button
  function loop(name, ref, o = {}) {
    const src = resolve(ref) || o.stand || null;
    const cur = loops[name];
    if (cur && cur.src === src) return;
    if (cur) { const old = cur.el; fade(old, 0, 0.8, () => old.pause()); delete loops[name]; }
    if (!src) return;
    const el = new Audio(src); el.loop = true; el.volume = 0; el.preload = "auto";
    loops[name] = { el, src, vol: (o.vol == null ? 1 : o.vol) * (VOL[o.kind || name] || VOL.ambience) };
    if (on) { start(el); fade(el, loops[name].vol, 1.6); }
  }

  // synthesized effects for the ones without a recording yet (short, soft, under the story's levels)
  function tone(type, f0, f1, secs, vol, at = 0) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + 0.01 + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + secs);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + secs);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + secs + 0.02);
  }
  function noise(secs, vol, freq, at = 0) {
    const c = ctx(); if (!c) return;
    const n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + 0.01 + at;
    s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.9; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  const SYNTH = {
    click: () => { tone("triangle", 1800, 1200, 0.05, 0.12); noise(0.03, 0.15, 3000); },
    tick: () => tone("sine", 1500, 1500, 0.04, 0.08),
    sweep: () => { tone("sine", 400, 1400, 0.5, 0.06); tone("triangle", 800, 2400, 0.5, 0.03, 0.05); },
    thud: () => { tone("sine", 140, 55, 0.22, 0.4); noise(0.08, 0.35, 900); },
    type: () => { for (let i = 0; i < 6; i++) { noise(0.025, 0.12, 2200 + (i % 3) * 400, i * 0.07); } tone("square", 1700, 1700, 0.05, 0.03, 0.45); },
    blink: () => tone("square", 900, 900, 0.03, 0.03),
  };
  const synth = (name) => { if (on && SYNTH[name]) SYNTH[name](); };

  // one effect: the recording if it's made, else the stand-in path, else the synthesized sound
  function play(ref, o = {}) {
    if (!on) return null;
    const src = resolve(ref) || o.stand || null;
    if (!src) { if (o.synth) synth(o.synth); return null; }
    const a = new Audio(src); a.volume = Math.min(1, VOL.sfx * (o.vol == null ? 1 : o.vol)); start(a);
    if (o.max) setTimeout(() => fade(a, 0, 0.35, () => a.pause()), o.max * 1000);
    return a;
  }

  function beep(feel) {
    if (!on) return 0;
    const c = ctx(); if (!c) return 0;
    const out = c.createGain(); out.gain.value = 0.05; out.connect(c.destination);
    let t = c.currentTime + 0.03;
    for (const [f, d] of BEEPS[feel] || BEEPS.curious) {
      if (f) {
        const osc = c.createOscillator(), g = c.createGain(); osc.type = "square"; osc.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.01); g.gain.setValueAtTime(1, t + d - 0.02); g.gain.linearRampToValueAtTime(0, t + d);
        osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + d);
      }
      t += d + 0.03;
    }
    return (t - c.currentTime) * 1000;
  }

  function label(b) { b.textContent = on ? "Sound: on" : "Sound: off"; b.setAttribute("aria-pressed", on ? "true" : "false"); }
  function set(v) {
    on = v; store.set("cr-story-sound", on ? "1" : "0"); buttons.forEach(label);
    for (const l of Object.values(loops)) { if (on) { start(l.el); fade(l.el, l.vol, 1.2); } else fade(l.el, 0, 0.5, () => l.el.pause()); }
    if (on) { ctx(); SYNTH.click(); }
  }
  function button(b) { buttons.push(b); label(b); b.addEventListener("click", () => set(!on)); }

  window.StorySound = { init(assets) { A = assets || {}; }, loop, play, synth, beep, button, set, get on() { return on; } };
})();
