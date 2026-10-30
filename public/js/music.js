/*
 * Background music for the host board: original chiptune tracks in the style of 8-bit console games
 * (two pulse-wave channels, a triangle bass and a noise drum channel), synthesized with Web Audio, no audio files.
 * Off until the Music button turns it on. host.js calls Music.play(scene) as the game moves;
 * the scene is remembered while music is off, so turning it on starts the right loop.
 *
 * A track has one chord per bar and 16 steps per bar. Each part lists one pattern per bar
 * (the list repeats; null = silent that bar). Pattern tokens, separated by spaces:
 *   .  rest                -  hold the previous note
 *   0-5  chord tone: 0 root, 1 third, 2 fifth, 3-5 the same an octave up
 *   c  the whole chord (arp plays it as a fast arpeggio)      A4, C#5, Bb3  a fixed note
 *   drums: k kick, s snare, h hi-hat, o open hat, x crash, t tom (stack them: kx)
 * Instruments: pulse (duty 0.125 thin, 0.25 classic, 0.5 round; vib = vibrato on held notes,
 *   echo = [steps, level] one delayed repeat, gate = how much of each note sounds), tri (triangle bass),
 *   arp (a chord as a fast three-note arpeggio, the old trick for playing chords on one channel), drums (noise).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Music = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ARP = "c - - - - - - - - - - - - - - -", STABS = ". . c - . . c - . . c - . . c -";
  const BEAT = "k . h . s . h . k . h k s . h .", ROCK = "k h h h s h h h k h k h s h h h";
  const TRACKS = {
    // lobby and between matches: a bouncy "stage select" groove, 16 bars so it doesn't get old
    garage: {
      bpm: 132, chords: ["C", "G", "Am", "F", "C", "G", "F", "G", "F", "G", "Em", "Am", "F", "G", "C", "G"],
      parts: [
        { ins: "pulse", duty: 0.25, vib: true, echo: [3, 0.3], vol: 0.085, pat: [
          "E5 . G5 . C6 - - . B5 . G5 . E5 - - .",
          "D5 - - . G5 . B5 . D6 - - - B5 - - .",
          "C6 . B5 . A5 - - . E5 . A5 . C6 - - .",
          "A5 - - - - - . . G5 . F5 . E5 . D5 .",
          "E5 . G5 . C6 - - . D6 . C6 . G5 - - .",
          "B5 - - . D6 . B5 . G5 - - . D5 - - .",
          "C6 . A5 . F5 - - . A5 . C6 . F6 - - .",
          "E6 - - - D6 - - - B5 - - - G5 - - .",
          "A5 - - . A5 . C6 . A5 - - . F5 - - .",
          "G5 - - . G5 . B5 . D6 - - . B5 - - .",
          "B5 - - . G5 . E5 . G5 - - . B5 - - .",
          "C6 - - - - - - . E6 - - . C6 - - .",
          "A5 . C6 . F6 - - . E6 . D6 . C6 - - .",
          "B5 . D6 . G6 - - . F6 . E6 . D6 - - .",
          "E6 - - . C6 - - . G5 - - . E5 - - .",
          "D5 - - . G5 - - . B5 - - . D6 . B5 ."] },
        { ins: "arp", duty: 0.125, oct: 12, gate: 0.6, vol: 0.03, pat: [STABS] },
        { ins: "tri", oct: -12, vol: 0.22, pat: Array(7).fill("0 . 3 . 2 . 3 . 0 . 3 . 2 . 3 .").concat("0 . 3 . 2 . 1 . 0 . 2 . 3 . 4 .") },
        { ins: "drums", vol: 0.5, pat: ["kx . h . s . h . k . h k s . h ."].concat(Array(6).fill(BEAT), "k . h . s . h . s . s . s s s s") },
      ],
    },
    // Up Next card while students predict: a tense "boss incoming" riff, snare roll into each loop
    hype: {
      bpm: 144, chords: ["Em", "C", "D", "B"],
      parts: [
        { ins: "pulse", duty: 0.125, echo: [2, 0.3], vol: 0.075, pat: [
          "E5 - - . E5 . G5 . B5 - - . A5 . G5 .",
          "E5 - - - - - . . C5 . E5 . G5 - - .",
          "F#5 - - . F#5 . A5 . D6 - - . C6 . A5 .",
          "B5 - - - - - - - D#6 - - - F#6 - - ."] },
        { ins: "arp", duty: 0.25, oct: 12, vol: 0.035, pat: [ARP] },
        { ins: "tri", oct: -12, vol: 0.22, pat: ["0 . 0 . 0 . 0 . 0 . 0 . 3 . 0 ."] },
        { ins: "drums", vol: 0.5, pat: ["kx h h h s h h h k h k h s h h h", ROCK, ROCK, "k h h h s h h h s s s s s s s s"] },
      ],
    },
    // the fight: a fast, heroic boss battle in A minor with a galloping bass and an echoing lead
    fight: {
      bpm: 168, chords: ["Am", "F", "G", "Em", "Am", "F", "G", "E", "F", "G", "Am", "Am", "F", "G", "E", "E"],
      parts: [
        { ins: "pulse", duty: 0.25, vib: true, echo: [3, 0.28], vol: 0.085, pat: [
          "A4 . C5 . E5 . A5 - - . G5 . E5 - - .",
          "F5 - - . A5 - - . C6 - - . A5 . F5 .",
          "G5 - - . B5 - - . D6 - - . B5 . G5 .",
          "E5 - - - - - . . B4 . E5 . G5 . B5 .",
          "C6 - - . B5 . A5 . E5 - - . A5 . C6 .",
          "D6 - - . C6 . A5 . F5 - - . A5 . C6 .",
          "B5 - - . G5 . D6 . B5 - - . G5 . D5 .",
          "E5 - - - G#5 - - - B5 - - - E6 - - .",
          "A5 - - - - - - . G5 - F5 - E5 - F5 -",
          "G5 - - - - - - . F5 - E5 - D5 - E5 -",
          "E5 - - . A5 - - . C6 - - . E6 - - .",
          "D6 . C6 . B5 . A5 . G5 . A5 . B5 . C6 .",
          "A5 - - . C6 - - . F6 - - . E6 . D6 .",
          "D6 - - . B5 - - . G5 - - . A5 . B5 .",
          "G#5 - - - - - . . B5 - - - - - . .",
          "E6 . D6 . B5 . G#5 . E5 . G#5 . B5 . D6 ."] },
        { ins: "pulse", duty: 0.125, oct: 12, vol: 0.04, pat: Array(8).fill(null).concat(Array(8).fill("2 - - - - - - - 1 - - - - - - -")) },
        { ins: "arp", duty: 0.5, oct: 12, vol: 0.028, pat: Array(8).fill(ARP).concat(Array(8).fill(null)) },
        { ins: "tri", oct: -12, vol: 0.22, pat: Array(8).fill("0 . 0 0 3 . 0 0 0 . 0 0 3 . 2 .").concat(Array(8).fill("0 . 3 . 0 . 3 . 0 . 3 . 2 . 1 .")) },
        { ins: "drums", vol: 0.5, pat: ["kx . h . s . h k k . h . s . h ."].concat(Array(6).fill("k . h . s . h k k . h . s . h ."), "k . s . k . s . s s s s s s s s",
          "kx h h h s h h h k h k h s h h h", Array(6).fill(ROCK), "k . s . k . s . s s s s t t t t") },
      ],
    },
    // champion screen: a bright, bouncy victory tune in C major
    champion: {
      bpm: 144, chords: ["C", "F", "C", "G", "C", "F", "G", "C"],
      parts: [
        { ins: "pulse", duty: 0.5, gate: 0.7, echo: [2, 0.25], vol: 0.08, pat: [
          "C5 . E5 . G5 . C6 - - . E6 - - . . .",
          "F5 . A5 . C6 . F6 - - . A6 - - . . .",
          "G6 - - . E6 - - . C6 - - . G5 - - .",
          "B5 . D6 . G6 - - - F6 - E6 - D6 - - .",
          "C6 . G5 . E5 . G5 . C6 - - . E6 - - .",
          "F6 - - . E6 . D6 . C6 - - . A5 - - .",
          "B5 . C6 . D6 . E6 . F6 . E6 . D6 . B5 .",
          "C6 - - - - - - - G5 - - . C6 - - ."] },
        { ins: "arp", duty: 0.25, oct: 12, gate: 0.5, vol: 0.03, pat: [". . c . . . c . . . c . . . c ."] },
        { ins: "tri", oct: -12, vol: 0.22, pat: ["0 . . 2 3 . . 2 0 . . 2 3 . 2 ."] },
        { ins: "drums", vol: 0.48, pat: ["kx . h . s . h . k . h k s . h ."].concat(Array(6).fill(BEAT), "k . s . s . s . s s s s x . . .") },
      ],
    },
  };

  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, ACC = { "#": 1, b: -1, "": 0 };
  // chord roots sit between E3 and D#4: chord tones and arpeggios stay mid-range, and the triangle (an octave down) stays audible on small speakers
  function chordOf(name) {
    const [, l, a, m] = /^([A-G])([#b]?)(m?)$/.exec(name), r = 52 + ((NAMES[l] + ACC[a] + 8) % 12);
    return [r, r + (m ? 3 : 4), r + 7];
  }
  function noteOf(tok) { const [, l, a, o] = /^([A-G])([#b]?)(\d)$/.exec(tok); return 12 * (+o + 1) + NAMES[l] + ACC[a]; }
  for (const tr of Object.values(TRACKS)) {
    tr.chordNotes = tr.chords.map(chordOf);
    tr.parts.forEach((p) => (p.rows = p.pat.map((r) => r && r.trim().split(/\s+/))));
  }

  // ---------------- the chip (browser only) ----------------
  const VOL = 0.2; // keeps the music under the sound effects so hits and the win jingle still stand out
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // pulse waves at three duty cycles, and NES-style noise from a 15-bit shift register ("metal" loops every 93 steps)
  function makeChip(ctx) {
    const wave = (d) => {
      const n = 64, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * d) / (Math.PI * k); im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k); }
      return ctx.createPeriodicWave(re, im);
    };
    const lfsr = (short) => {
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
      let r = 1; for (let i = 0; i < d.length; i++) { const fb = (r ^ (r >> (short ? 6 : 1))) & 1; r = (r >> 1) | (fb << 14); d[i] = r & 1 ? -0.8 : 0.8; }
      return b;
    };
    return { duty: { 0.125: wave(0.125), 0.25: wave(0.25), 0.5: wave(0.5) }, noise: lfsr(false), metal: lfsr(true) };
  }
  function env(ctx, dest, t, v, attack, hold, release) {
    const g = ctx.createGain(), h = t + Math.max(attack, hold);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.setValueAtTime(v, h); g.gain.exponentialRampToValueAtTime(0.0001, h + release);
    g.connect(dest); return [g, h + release];
  }
  function osc(ctx, wave, freq, t, end, dest) {
    const o = ctx.createOscillator();
    if (typeof wave === "string") o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(freq, t); o.connect(dest); o.start(t); o.stop(end + 0.02);
    return o;
  }
  function hiss(ctx, chip, t, dur, v, rate, dest, metal) {
    const [g, end] = env(ctx, dest, t, v, 0.001, 0.001, dur), s = ctx.createBufferSource();
    s.buffer = metal ? chip.metal : chip.noise; s.loop = true; s.playbackRate.value = rate;
    s.connect(g); s.start(t, Math.random() * 0.5); s.stop(end + 0.02);
  }
  const INS = {
    pulse(ctx, chip, m, t, d, p, dest) {
      const f = mtof(m), [g, end] = env(ctx, dest, t, p.vol, 0.004, d * (p.gate ?? 0.92), 0.05), o = osc(ctx, chip.duty[p.duty || 0.25], f, t, end, g);
      if (p.vib && d > 0.25) { // vibrato that starts a moment into a held note
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 6; depth.gain.setValueAtTime(0, t); depth.gain.setValueAtTime(0, t + 0.12); depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.3);
        lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(end);
      }
    },
    tri(ctx, chip, m, t, d, p, dest) { const [g, end] = env(ctx, dest, t, p.vol, 0.003, d * (p.gate ?? 0.9), 0.03); osc(ctx, "triangle", mtof(m), t, end, g); },
    // one oscillator stepping through the chord three times a step
    arp(ctx, chip, notes, t, d, sp, p, dest) {
      const len = d * (p.gate ?? 0.95), sub = sp / 3, [g, end] = env(ctx, dest, t, p.vol, 0.002, len, 0.03), o = osc(ctx, chip.duty[p.duty || 0.25], mtof(notes[0]), t, end, g);
      for (let k = 1; k * sub < len; k++) o.frequency.setValueAtTime(mtof(notes[k % notes.length]), t + k * sub);
    },
  };
  const DRUM = {
    k(ctx, chip, t, v, dest) { const [g, end] = env(ctx, dest, t, v * 0.9, 0.001, 0.02, 0.12), o = osc(ctx, "triangle", 130, t, end, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.11); hiss(ctx, chip, t, 0.03, v * 0.25, 0.12, dest); },
    s(ctx, chip, t, v, dest) { hiss(ctx, chip, t, 0.13, v * 0.45, 0.55, dest); const [g, end] = env(ctx, dest, t, v * 0.35, 0.001, 0.01, 0.06); osc(ctx, "triangle", 200, t, end, g); },
    h(ctx, chip, t, v, dest) { hiss(ctx, chip, t, 0.03, v * 0.16, 1, dest); },
    o(ctx, chip, t, v, dest) { hiss(ctx, chip, t, 0.16, v * 0.14, 1, dest); },
    x(ctx, chip, t, v, dest) { hiss(ctx, chip, t, 0.7, v * 0.22, 0.85, dest); },
    t(ctx, chip, t, v, dest) { const [g, end] = env(ctx, dest, t, v * 0.7, 0.001, 0.02, 0.12), o = osc(ctx, "triangle", 220, t, end, g); o.frequency.exponentialRampToValueAtTime(90, t + 0.13); },
  };

  // schedule a track's notes from state st up to time `until`
  function schedule(st, until) {
    const tr = st.tr, sp = 60 / tr.bpm / 4;
    while (st.t < until) {
      const bar = Math.floor(st.i / 16), s = st.i % 16, chord = tr.chordNotes[bar];
      tr.parts.forEach((p, k) => {
        const row = p.rows[bar % p.rows.length], tok = row && row[s];
        if (!tok || tok === "." || tok === "-") return;
        if (p.ins === "drums") { for (const ch of tok) DRUM[ch](st.ctx, st.chip, st.t, p.vol, st.dest[k]); return; }
        let len = 1; while (row[s + len] === "-") len++;
        const oct = p.oct || 0, notes = tok === "c" ? chord.map((m) => m + oct) : [(/^\d$/.test(tok) ? chord[+tok % 3] + 12 * Math.floor(+tok / 3) : noteOf(tok)) + oct];
        if (p.ins === "arp") INS.arp(st.ctx, st.chip, notes, st.t, len * sp, sp, p, st.dest[k]);
        else notes.forEach((m) => INS[p.ins](st.ctx, st.chip, m, st.t, len * sp, p, st.dest[k]));
      });
      st.i = (st.i + 1) % (tr.chords.length * 16); st.t += sp;
    }
  }
  // a mixer input per part; echo parts also feed one delayed, quieter copy of themselves
  function newState(ctx, chip, name, bus, t) {
    const tr = TRACKS[name], sp = 60 / tr.bpm / 4;
    const dest = tr.parts.map((p) => {
      const g = ctx.createGain(); g.connect(bus);
      if (p.echo) { const dl = ctx.createDelay(1), eg = ctx.createGain(); dl.delayTime.value = p.echo[0] * sp; eg.gain.value = p.echo[1]; g.connect(dl).connect(eg).connect(bus); }
      return g;
    });
    return { name, tr, i: 0, t, ctx, chip, bus, dest };
  }

  let actx = null, out = null, chip = null, on = false, want = "garage", cur = null, timer = null;
  function tick() {
    if (!cur) return;
    if (cur.t < actx.currentTime) cur.t = actx.currentTime + 0.05; // fell behind (tab asleep): skip ahead instead of piling up notes
    schedule(cur, actx.currentTime + 0.3);
  }
  function start(name, delay = 0) {
    if (cur) { const b = cur.bus; b.gain.setTargetAtTime(0, actx.currentTime, 0.15); setTimeout(() => b.disconnect(), 2000); }
    cur = null;
    if (!name) return;
    const bus = actx.createGain(); bus.connect(out);
    cur = newState(actx, chip, name, bus, actx.currentTime + delay + 0.05);
    tick();
  }

  return {
    TRACKS, VOL,
    get on() { return on; },
    toggle() {
      on = !on;
      if (on && !actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); out = actx.createGain(); out.gain.value = VOL; out.connect(actx.destination); chip = makeChip(actx); }
        catch { on = false; actx = null; }
      }
      clearInterval(timer);
      if (on) { actx.resume(); start(want); timer = setInterval(tick, 50); } else if (actx) start(null);
      return on;
    },
    play(name, delay = 0) {
      if (name === want) return;
      want = name;
      if (on) start(name, delay);
    },
    // render `seconds` of a track without playing it (sound test page and level checks): resolves to an AudioBuffer
    render(name, seconds) {
      const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100), master = ctx.createGain();
      master.gain.value = VOL; master.connect(ctx.destination);
      schedule(newState(ctx, makeChip(ctx), name, master, 0.02), seconds);
      return ctx.startRendering();
    },
  };
});
