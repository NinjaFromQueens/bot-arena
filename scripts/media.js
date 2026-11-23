#!/usr/bin/env node
/* Story media: even out loudness and make web copies (MED-3; docs/story-media-plan.md, "Files and levels").
 *
 *   node scripts/media.js report <dir>                    loudness, peak, length and size of every sound file
 *   node scripts/media.js make <in> <out> [options]       web copies, leveled, with the same folder layout
 *     --kind voice|music|ambient|sfx|still|clip           otherwise from the folder name (voice*, music, ambient, sfx)
 *                                                       or the file type (pictures are stills, videos are clips)
 *     --lufs N        a different loudness target for this batch
 *     --pauses        shorten pauses inside voice lines to about 0.4 s (Seed Audio pauses up to a second)
 *     --width N       stills and clips: the widest a copy can be (stills 1920, clips 1280)
 *     --mute          clips: drop the sound
 *     --force         remake copies that are newer than their source
 *
 * Audio: measured with EBU R128 (integrated loudness, true peak), then gain to the target and a limiter at -2 dBFS (true peaks under -1.5 dBTP),
 * measured again and corrected once (the limiter and the encoder move it a little). Voice is trimmed to 50 ms before
 * and 150 ms after the speech, mono, 64 kbps MP3; music and ambience stereo 128 kbps; sound effects keep their channels.
 * Stills: WebP, quality lowered step by step until the file is under 400 KB. Clips: VP9 WebM at about 1.25 Mbps (about
 * 1 MB per 5 seconds) with Opus sound. Needs ffmpeg: FFMPEG=path, on PATH, or winget's Gyan.FFmpeg folder.
 * Not used by the site or the tests; production tool only. */
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");

// loudness targets (tune by ear): voice and music from the plan; ambience sits under both; sound effects between
const KINDS = {
  voice: { lufs: -16, codec: ["-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"], ext: ".mp3" },
  music: { lufs: -20, codec: ["-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k"], ext: ".mp3" },
  ambient: { lufs: -24, codec: ["-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k"], ext: ".mp3" },
  sfx: { lufs: -18, codec: ["-c:a", "libmp3lame", "-b:a", "128k"], ext: ".mp3" },
};
const AUDIO = /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i, PICTURE = /\.(png|jpe?g|webp)$/i, VIDEO = /\.(mp4|mov|webm|mkv)$/i;
const LIMIT = 0.79; // -2 dBFS on the samples, so true peaks stay under -1.5 dBTP after MP3 encoding
const STILL_KB = 400, STILL_W = 1920, CLIP_W = 1280;
const TRIM = "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.15,areverse,afade=t=in:d=0.01,areverse,afade=t=in:d=0.03,areverse";
const PAUSES = "silenceremove=stop_periods=-1:stop_duration=0.25:stop_threshold=-40dB:stop_silence=0.15";

function findFfmpeg() {
  const runs = (p) => { try { return spawnSync(p, ["-version"], { encoding: "utf8" }).status === 0; } catch { return false; } };
  if (process.env.FFMPEG && runs(process.env.FFMPEG)) return process.env.FFMPEG;
  if (runs("ffmpeg")) return "ffmpeg";
  const root = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages"), exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  try {
    for (const pkg of fs.readdirSync(root).filter((n) => /ffmpeg/i.test(n)))
      for (const build of fs.readdirSync(path.join(root, pkg))) { const p = path.join(root, pkg, build, "bin", exe); if (fs.existsSync(p)) return p; }
  } catch {}
  return null;
}
const FF = findFfmpeg();
function ff(args) {
  const r = spawnSync(FF, ["-hide_banner", "-nostdin", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + (r.stderr || "").split("\n").filter(Boolean).slice(-3).join(" | "));
  return r.stderr || "";
}
// integrated loudness (LUFS), true peak (dBTP) and length (s)
function measure(file) {
  const log = ff(["-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const num = (re) => { const m = log.match(re); return m ? parseFloat(m[1]) : NaN; };
  const d = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { lufs: num(/^\s+I:\s+(-?[\d.]+|-inf) LUFS/m), peak: num(/^\s+Peak:\s+(-?[\d.]+|-inf) dBFS/m), secs: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : NaN };
}
const kindOf = (file, forced) => {
  if (forced) return forced;
  if (PICTURE.test(file)) return "still";
  if (VIDEO.test(file)) return "clip";
  const parts = file.toLowerCase().split(/[\\/]/);
  return parts.some((p) => /^voice/.test(p)) ? "voice" : parts.includes("music") ? "music" : parts.includes("ambient") ? "ambient" : parts.includes("sfx") ? "sfx" : null;
};
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out.sort();
}
const kb = (file) => fs.statSync(file).size / 1024;
const fmt = (n, dp = 1) => (Number.isFinite(n) ? n.toFixed(dp) : "–");

// ---------------- make ----------------
function makeAudio(src, dst, kind, o) {
  const K = KINDS[kind], target = o.lufs != null ? o.lufs : K.lufs, tmp = path.join(os.tmpdir(), `media-${process.pid}-${Date.now()}.wav`);
  const prep = ["aresample=44100:resampler=soxr", kind === "voice" ? TRIM : null].filter(Boolean).join(",");
  ff(["-loglevel", "error", "-y", "-i", src, ...(kind === "voice" ? ["-ac", "1"] : []), "-af", prep, tmp]);
  const before = measure(tmp);
  if (!Number.isFinite(before.lufs)) { fs.unlinkSync(tmp); throw new Error("silent or unreadable"); }
  const encode = (gain) => ff(["-loglevel", "error", "-y", "-i", tmp, "-af", [`volume=${gain.toFixed(2)}dB`, kind === "voice" && o.pauses ? PAUSES : null, `alimiter=limit=${LIMIT}:level=false:attack=2:release=50`].filter(Boolean).join(","),
    "-map_metadata", "-1", "-ar", "44100", ...K.codec, dst]);
  let gain = target - before.lufs;
  encode(gain);
  let after = measure(dst);
  if (Math.abs(target - after.lufs) > 0.3) { gain += target - after.lufs; encode(gain); after = measure(dst); }
  fs.unlinkSync(tmp);
  // a sound with sharp peaks (a pure beep) can't reach the target without clipping: the limiter holds it back, and says so
  const held = after.lufs < target - 0.5 ? " (as loud as it goes without clipping: the limiter held it back)" : "";
  return `${fmt(before.lufs)} → ${fmt(after.lufs)} LUFS (target ${target})${held}, peak ${fmt(after.peak)} dBTP, ${fmt(after.secs, 2)} s, ${fmt(kb(dst), 0)} KB`;
}
function makeStill(src, dst, o) {
  const width = o.width || STILL_W;
  let q = 82;
  for (;;) {
    ff(["-loglevel", "error", "-y", "-i", src, "-vf", `scale='min(${width},iw)':-2:flags=lanczos`, "-c:v", "libwebp", "-quality", String(q), "-compression_level", "6", "-map_metadata", "-1", dst]);
    if (kb(dst) <= STILL_KB || q <= 50) break;
    q -= 6;
  }
  return `quality ${q}, ${fmt(kb(dst), 0)} KB${kb(dst) > STILL_KB ? " (still over 400 KB: try a smaller --width)" : ""}`;
}
function makeClip(src, dst, o) {
  const width = o.width || CLIP_W;
  ff(["-loglevel", "error", "-y", "-i", src, "-vf", `scale='min(${width},iw)':-2:flags=lanczos`, "-c:v", "libvpx-vp9", "-b:v", "1250k", "-maxrate", "1600k", "-bufsize", "2500k",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", ...(o.mute ? ["-an"] : ["-c:a", "libopus", "-b:a", "64k"]), "-map_metadata", "-1", dst]);
  const m = measure(dst);
  return `${fmt(m.secs, 1)} s, ${fmt(kb(dst), 0)} KB (${fmt(kb(dst) / 1024 / (m.secs / 5), 2)} MB per 5 s)`;
}
function make(inDir, outDir, o) {
  const files = walk(inDir).filter((f) => AUDIO.test(f) || PICTURE.test(f) || VIDEO.test(f));
  let made = 0, skipped = 0, failed = 0;
  for (const src of files) {
    const rel = path.relative(inDir, src), kind = kindOf(path.join(path.basename(path.resolve(inDir)), rel), o.kind); // the in folder's own name counts (make voice/ out/)
    if (!kind) { console.log(`skip  ${rel}: which kind? Put it in a voice, music, ambient or sfx folder, or pass --kind`); skipped++; continue; }
    const ext = kind === "still" ? ".webp" : kind === "clip" ? ".webm" : KINDS[kind].ext;
    const dst = path.join(outDir, rel.replace(/\.[^.\\/]+$/, ext));
    if (path.resolve(dst) === path.resolve(src)) { console.log(`skip  ${rel}: the copy would replace the source; use another out folder`); skipped++; continue; }
    if (!o.force && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) { skipped++; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try {
      const said = kind === "still" ? makeStill(src, dst, o) : kind === "clip" ? makeClip(src, dst, o) : makeAudio(src, dst, kind, o);
      console.log(`${kind.padEnd(7)} ${rel}: ${said}`); made++;
    } catch (e) { console.log(`FAIL  ${rel}: ${e.message}`); failed++; }
  }
  console.log(`\n${made} made, ${skipped} skipped (up to date or unknown kind), ${failed} failed`);
  return failed ? 1 : 0;
}

// ---------------- report ----------------
function report(dir) {
  const rows = walk(dir).filter((f) => AUDIO.test(f)).map((f) => {
    const rel = path.relative(dir, f), kind = kindOf(path.join(path.basename(path.resolve(dir)), rel)), m = measure(f), target = kind ? KINDS[kind].lufs : null;
    return { rel, kind: kind || "?", ...m, kb: kb(f), kbps: (kb(f) * 8) / m.secs, off: target != null ? m.lufs - target : NaN };
  });
  console.log("file".padEnd(42) + "kind".padEnd(9) + "LUFS".padStart(7) + "  off".padStart(7) + "peak".padStart(7) + "secs".padStart(7) + "KB".padStart(7) + "kbps".padStart(6));
  for (const r of rows) console.log(r.rel.slice(-41).padEnd(42) + r.kind.padEnd(9) + fmt(r.lufs).padStart(7) + (Number.isFinite(r.off) ? (r.off >= 0 ? "+" : "") + fmt(r.off) : "–").padStart(7) + fmt(r.peak).padStart(7) + fmt(r.secs).padStart(7) + fmt(r.kb, 0).padStart(7) + fmt(r.kbps, 0).padStart(6) + (Math.abs(r.off) > 1.5 ? "  <- off target" : ""));
  console.log("\nper kind (median loudness, against the target):");
  for (const k of Object.keys(KINDS)) {
    const v = rows.filter((r) => r.kind === k).map((r) => r.lufs).filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length) console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(3)} files, median ${fmt(v[v.length >> 1])} LUFS, range ${fmt(v[0])} to ${fmt(v[v.length - 1])}, target ${KINDS[k].lufs}`);
  }
  return 0;
}

// ---------------- command line ----------------
function main(argv) {
  const [cmd, ...rest] = argv, o = {}, pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--kind") o.kind = rest[++i]; else if (a === "--lufs") o.lufs = parseFloat(rest[++i]); else if (a === "--width") o.width = parseInt(rest[++i], 10);
    else if (a === "--pauses") o.pauses = true; else if (a === "--mute") o.mute = true; else if (a === "--force") o.force = true; else pos.push(a);
  }
  const usage = () => { console.log("Usage:\n  node scripts/media.js report <dir>\n  node scripts/media.js make <in dir> <out dir> [--kind voice|music|ambient|sfx|still|clip] [--lufs N] [--pauses] [--width N] [--mute] [--force]"); return 2; };
  if (!["report", "make"].includes(cmd)) return usage();
  if (o.kind && !KINDS[o.kind] && !["still", "clip"].includes(o.kind)) { console.log(`Unknown kind: ${o.kind}`); return 2; }
  if (!FF) { console.log("ffmpeg not found. Install it (winget install Gyan.FFmpeg) or set FFMPEG to its path."); return 1; }
  if (cmd === "report" && pos.length === 1) return report(pos[0]);
  if (cmd === "make" && pos.length === 2) return make(pos[0], pos[1], o);
  return usage();
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { KINDS, kindOf, measure, main, FF };
