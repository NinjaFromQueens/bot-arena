/*
 * Background music for the host board, synthesized with Web Audio (no audio files).
 * Off until the Music button turns it on. host.js calls Music.play(scene) as the game moves;
 * the scene is remembered while music is off, so turning it on starts the right loop.
 *
 * A track has one chord per bar and 16 steps per bar. Each part lists one pattern per bar
 * (the list repeats; null = silent that bar). Pattern tokens, separated by spaces:
 *   .  rest                -  hold the previous note
 *   0-5  chord tone: 0 root, 1 third, 2 fifth, 3-5 the same an octave up
 *   c  whole chord         A4, C#5, Bb3  a fixed note
 *   drums: k kick, s snare, h hi-hat (stack them: kh)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Music = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAD = "c - - - - - - - - - - - - - - -", ARP = "0 . 1 . 2 . 3 . 2 . 1 . 2 . 1 .";
  const TRACKS = {
    // lobby and between matches: laid back, easy to talk over
    garage: {
      bpm: 100, chords: ["Am", "F", "C", "G", "Am", "F", "C", "G"],
      parts: [
        { ins: "pad", vol: 0.035, pat: [PAD] },
        { ins: "bass", oct: -12, vol: 0.18, pat: ["0 . . 0 . . 3 . 0 . . 2 . . 3 ."] },
        { ins: "arp", oct: 12, vol: 0.06, pat: [ARP, ARP, ARP, ARP, null, null, null, null] },
        { ins: "drums", vol: 0.45, pat: ["kh . h . sh . h k kh . h . sh . h ."] },
        { ins: "lead", vol: 0.08, pat: [null, null, null, null,
          "A4 . C5 . E5 - - . D5 . C5 . D5 - - .",
          "C5 - - . A4 . C5 . F5 - - - E5 - - .",
          "E5 - - . G5 - - . E5 . D5 . C5 - - .",
          "D5 - - - - - . . B4 . C5 . D5 - - ."] },
      ],
    },
    // Up Next card while students predict: ticking suspense, snare roll into each loop
    hype: {
      bpm: 120, chords: ["Am", "Am", "F", "E"],
      parts: [
        { ins: "pad", vol: 0.03, pat: [PAD] },
        { ins: "bass", oct: -12, vol: 0.18, pat: ["0 . 3 . 0 . 3 . 0 . 3 . 0 . 3 ."] },
        { ins: "arp", oct: 12, vol: 0.045, pat: ["0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1"] },
        { ins: "drums", vol: 0.45, pat: ["kh h h h kh h h h kh h h h kh h h h", "kh h h h kh h h h kh h h h kh h h h", "kh h h h kh h h h kh h h h kh h h h",
          "k . s . k . s . s s s s s s s s"] },
      ],
    },
    // the fight: galloping bass and a heroic lead over Am G F E
    fight: {
      bpm: 150, chords: ["Am", "G", "F", "E", "Am", "G", "F", "E"],
      parts: [
        { ins: "pad", vol: 0.03, pat: [PAD] },
        { ins: "bass", oct: -12, vol: 0.2, pat: ["0 . 0 0 3 . 0 0 0 . 0 0 3 . 2 ."] },
        { ins: "drums", vol: 0.5, pat: Array(7).fill("kh . h . sh . h . kh . kh . sh . h .").concat("kh . h . sh . h . s . s . s s s s") },
        { ins: "lead", vol: 0.09, pat: [
          "A4 - - . C5 - - . E5 - - . A5 - - .",
          "G5 - - . F5 . E5 . D5 - - - B4 - - .",
          "C5 - - . F5 - - . A5 - - . G5 . F5 .",
          "E5 - - - - - - . G#4 - - . B4 - - .",
          "E5 . E5 . A5 - - . E5 . A5 . C6 - - .",
          "B5 - - . G5 - - . D5 - - . G5 - - .",
          "A5 - - . F5 - - . C5 - - . F5 . A5 .",
          "G#5 - - - - - - . E5 - - . B4 - - ."] },
      ],
    },
    // champion screen: bright march in C major
    champion: {
      bpm: 126, chords: ["C", "F", "G", "C", "Am", "F", "G", "G"],
      parts: [
        { ins: "pad", vol: 0.035, pat: [PAD] },
        { ins: "bass", oct: -12, vol: 0.18, pat: ["0 . . . 2 . . . 0 . . . 2 . 0 ."] },
        { ins: "arp", vol: 0.05, pat: [ARP] },
        { ins: "drums", vol: 0.45, pat: ["kh . h . sh . h . kh . h . sh . h s"] },
        { ins: "lead", vol: 0.09, pat: [
          "C5 - - . E5 - - . G5 - - - - - . .",
          "A5 - - . G5 . F5 . A5 - - - - - . .",
          "G5 - - . F5 . E5 . D5 - - . B4 - - .",
          "C5 - - - - - - - - - - - . . . .",
          "C5 - - . E5 - - . A5 - - - - - . .",
          "C5 - - . F5 . A5 . C6 - - . A5 - - .",
          "B5 - - . G5 - - . D5 - - . G5 - - .",
          "B5 - - - - - - . G5 - - . D5 - - ."] },
      ],
    },
  };

  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, ACC = { "#": 1, b: -1, "": 0 };
  // chord roots sit between E3 and D#4 so pads stay mid-range and bass (an octave down) stays audible on small speakers
  function chordOf(name) {
    const [, l, a, m] = /^([A-G])([#b]?)(m?)$/.exec(name), r = 52 + ((NAMES[l] + ACC[a] + 8) % 12);
    return [r, r + (m ? 3 : 4), r + 7];
  }
  function noteOf(tok) { const [, l, a, o] = /^([A-G])([#b]?)(\d)$/.exec(tok); return 12 * (+o + 1) + NAMES[l] + ACC[a]; }
  for (const tr of Object.values(TRACKS)) {
    tr.chordNotes = tr.chords.map(chordOf);
    tr.parts.forEach((p) => (p.rows = p.pat.map((r) => r && r.trim().split(/\s+/))));
  }

  // ---------------- synth (browser only) ----------------
  const VOL = 0.22; // keeps the music under the sound effects so hits and the win jingle still stand out
  let actx = null, out = null, pulse = null, noise = null, on = false, want = "garage", cur = null, timer = null;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function voice(type, freq, t, end, dest) {
    const o = actx.createOscillator();
    if (type === "pulse") o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(freq, t); o.connect(dest); o.start(t); o.stop(end + 0.05);
    return o;
  }
  function amp(dest, t, v, attack, hold, release) {
    const g = actx.createGain(), h = t + Math.max(attack, hold);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.setValueAtTime(v, h); g.gain.exponentialRampToValueAtTime(0.0001, h + release);
    g.connect(dest); return [g, h + release];
  }
  function lowpass(dest, freq, q = 0.7) { const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f; }
  function burst(t, dur, v, dest, hp) {
    const [g] = amp(dest, t, v, 0.001, 0.001, dur), f = actx.createBiquadFilter(), s = actx.createBufferSource();
    f.type = "highpass"; f.frequency.value = hp; s.buffer = noise; s.connect(f).connect(g); s.start(t); s.stop(t + dur + 0.05);
  }
  const INS = {
    bass(m, t, d, v, dest) { const [g, end] = amp(lowpass(dest, 800, 2), t, v, 0.005, d * 0.8, 0.06); voice("square", mtof(m), t, end, g); },
    lead(m, t, d, v, dest) {
      const f = mtof(m), [g, end] = amp(lowpass(dest, 3200), t, v, 0.01, d * 0.9, 0.08), o = voice("pulse", f, t, end, g);
      if (d > 0.35) { // gentle vibrato on held notes
        const lfo = actx.createOscillator(), depth = actx.createGain();
        lfo.frequency.value = 5.5; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.008, t + 0.35);
        lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(end);
      }
    },
    arp(m, t, d, v, dest) { const [g, end] = amp(dest, t, v, 0.003, 0.003, 0.22); voice("triangle", mtof(m), t, end, g); },
    pad(m, t, d, v, dest) { const [g, end] = amp(lowpass(dest, 900), t, v, 0.3, d, 0.5); [-6, 6].forEach((c) => voice("sawtooth", mtof(m) * Math.pow(2, c / 1200), t, end, g)); },
  };
  const DRUM = {
    k(t, v, dest) { const [g, end] = amp(dest, t, v, 0.001, 0.001, 0.25), o = voice("sine", 150, t, end, g); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); },
    s(t, v, dest) { burst(t, 0.15, v * 0.5, dest, 1200); const [g, end] = amp(dest, t, v * 0.3, 0.001, 0.001, 0.08); voice("triangle", 190, t, end, g); },
    h(t, v, dest) { burst(t, 0.04, v * 0.15, dest, 7000); },
  };

  function tick() {
    if (!cur) return;
    const tr = cur.tr, sp = 60 / tr.bpm / 4;
    if (cur.t < actx.currentTime) cur.t = actx.currentTime + 0.05; // fell behind (tab asleep): skip ahead instead of piling up notes
    while (cur.t < actx.currentTime + 0.3) {
      const bar = Math.floor(cur.i / 16), s = cur.i % 16, chord = tr.chordNotes[bar];
      tr.parts.forEach((p) => {
        const row = p.rows[bar % p.rows.length], tok = row && row[s];
        if (!tok || tok === "." || tok === "-") return;
        if (p.ins === "drums") { for (const ch of tok) DRUM[ch](cur.t, p.vol, cur.bus); return; }
        let len = 1; while (row[s + len] === "-") len++;
        const notes = tok === "c" ? chord : /^\d$/.test(tok) ? [chord[+tok % 3] + 12 * Math.floor(+tok / 3)] : [noteOf(tok)];
        notes.forEach((m) => INS[p.ins](m + (p.oct || 0), cur.t, len * sp, p.vol, cur.bus));
      });
      cur.i = (cur.i + 1) % (tr.chords.length * 16); cur.t += sp;
    }
  }
  function start(name, delay = 0) {
    if (cur) { const b = cur.bus; b.gain.setTargetAtTime(0, actx.currentTime, 0.15); setTimeout(() => b.disconnect(), 2000); }
    cur = null;
    if (!name) return;
    const bus = actx.createGain(); bus.connect(out);
    cur = { name, tr: TRACKS[name], i: 0, t: actx.currentTime + delay + 0.05, bus };
    tick();
  }

  return {
    TRACKS,
    get on() { return on; },
    toggle() {
      on = !on;
      if (on && !actx) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          out = actx.createGain(); out.gain.value = VOL; out.connect(actx.destination);
          const re = new Float32Array(32), im = new Float32Array(32); // 25% pulse wave, the classic chiptune lead
          for (let k = 1; k < 32; k++) { re[k] = Math.sin(Math.PI * k / 2) / (Math.PI * k); im[k] = (1 - Math.cos(Math.PI * k / 2)) / (Math.PI * k); }
          pulse = actx.createPeriodicWave(re, im);
          noise = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
          const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        } catch { on = false; actx = null; }
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
  };
});
