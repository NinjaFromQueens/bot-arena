# Bot Arena — Backlog

Last updated: November 10, 2026

---

## 🔴 Active Bugs
| # | Issue | Status | First seen |
|---|---|---|---|
| — | No active bugs | — | — |

---

## 🟡 In Progress
| # | Feature | Notes |
|---|---|---|
| F-02 | Story art with Higgsfield | First pass (robot parts, arena, karts, tracks) is done and live on /v2 (see Completed F-02a). Now: the Story Mode Asset Prompts pack in the approved style (art-work/story/STYLE.md), budget raised to about 195 credits total (Nov 7). Saved in `public/assets/` with every pack ID in `public/assets/story-assets.json`; not pushed. Nov 7: every picture in the pack is made (80 of 99 IDs: cast, recruits, OMNI, Wardens, bosses, 11 backgrounds, 15 cutscene keyframes, title, map, icon, frames, 5 rank badges) plus 2 test videos (intro, chapter 1; Kling 3.0, 5 s, sound off, 7.5 credits each). Spent 190.75 credits in all (balance 1010.3). Left: 19 videos (13 cutscenes + 6 boss intros, about 142 credits), to make once story mode is built. Shrink the videos before shipping: 8.6 MB per 5 s clip, and this PC has no ffmpeg. The tour (/tour) now opens on the title screen. |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-30 | Story mode: The Resistance | High | Teacher's story doc (Nov 7, 2026): OMNI, Volt, Commander Rivet, Sparrow, Torque; 12 chapters in 3 acts, each chapter = briefing, existing lesson, reskinned mission, debrief. Wrap lessons in story frames (`story.js` data + a frame in learn.js), keep lesson claims tested. Decided Nov 7: the kids' group is called the Circuit Rebels (not "the Spark"); story progress unlocks looks only (Volt skins, paint, voice lines, rank badges), never Bot Arena parts, so class tournaments stay fair. Recruit tier (grades 4-8) first; Cadet and Operative tiers later. Art: the teacher's Story Mode Asset Prompts pack, in the style approved Nov 7 (hand-drawn 2D with ink lines and painted backgrounds; OMNI's digital world in cel-shaded 3D; see art-work/story/STYLE.md; no older game art as references). Made so far: Volt model sheet + all 7 stages, Rivet/Sparrow/Torque model sheets, recruit, OMNI and Warden reference sheets, in public/assets/ with every pack ID in public/assets/story-assets.json. Needs accounts (F-11/accounts branch) to save progress across devices. New AI lessons for chapters 11-12. After graduation. |
| F-31 | The Workshop: multiplayer hub | Medium | Class-only lobby: robot avatars built from parts (no photos), walk around a 2D Workshop, quick messages and emotes only (decided Nov 7: no free typing or voice, at any grade), doors into Arena, Racer, Lab and story chapters. Teacher sees and moderates everyone. After graduation. |
| F-32 | Rename the platform to Circuit Rebels | Medium | Preview page and home panel use the name now ("Bot Arena is becoming Circuit Rebels"). The games, logo, titles, offline backups and docs change after graduation. Check the name (trademark, domain) before printing it. |
| F-25 | More game ideas (still to build) | Low | Racer: turning sprites and body roll, curbs, a lap replay with trackside cameras, multi-lap Race Day, new tracks (ice rink, city streets, mountain pass), rain that lowers grip, a track builder, unlockable stickers for the paint shop. Battles: paint patterns and faces for robots, a fighting-game TV look, an arena per round, live fight on students' phones, class vs boss, 2v2. Both: one "My Robot" for both games, big-text mode. (Skid marks were tried and dropped: with the low camera they sit behind your own kart.) |
| F-11 | Database for saved progress | Low | Only when needed: class rosters, teacher progress dashboard, season leaderboards. Render's free plan has no persistent storage. |

---

## ✅ Recently Completed
| # | Item | Deployed | Commit |
|---|---|---|---|
| F-39 | LinkedIn page linked from the site: a "Follow on LinkedIn" link in the home page's Circuit Rebels panel (hidden on phones so the Join box stays near the top) and under the sign-up form on the tour's last slide (hidden in trailer mode) | Pushed to main Nov 10, 2026 (no class running) | 3ebd930 |
| F-29 | Circuit Rebels tour (/tour): 14-scene story with 37 voiced lines (OMNI, Rivet, Sparrow, Torque, Volt), original music, world sounds, moving backgrounds, chase finale, auto-play, the Recruit card, trailer mode with a QR code to the form (/tour?trailer); the home page panel opens it | Pushed to main Nov 7, 2026 (no class running); checked on bot-arena-g5ew.onrender.com (153 browser checks) | 7c88954 |
| F-28b | Educator interest form embedded on /v2 and the tour | Pushed to main Nov 7, 2026 | 216c4ad |
| F-28 | Circuit Rebels preview page (`/v2`): what's coming, live robot and racer demos with the new art, a "Bot Arena is becoming Circuit Rebels" panel on the home page, and a slot for the educator interest form | Pushed to `main` Nov 7, 2026 (5pm, no class game running); checked on bot-arena-g5ew.onrender.com (all 24 browser checks, games unchanged) | 8461ec9 |
| F-02a | Game art first pass with Higgsfield: 13 robot parts (preview-only pack in `public/v2-art/`), the arena, 5 kart bodies and 3 track backdrops, shown on the preview page only | Pushed to `main` Nov 7, 2026 with F-28 | 8461ec9 |
| B-01 | Audit fixes: replay of the final cut short by game updates; Race Day laps limited to one try per second; garage picks throttled; race page no longer drives 36 laps on load (track par) | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 0a38d0c |
| F-25a | Extras: night headlights, "close behind" warning, simple graphics, smoke when badly hurt, gold lights for the final, top-3 podium | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-24 | Racer medals on every track | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-23 | Replay any finished match from the bracket | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-22 | Battle stage: a look per sensor (camera brackets, ultrasonic waves, touch whiskers, lidar sweep) with the hit chance | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-21 | Racer teaching HUD: rpm dial, hill profile (red = too steep for your gear), motor sound | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-20 | Robot Racer paint shop: bodies, colors, patterns, numbers, trims, exhaust, driver heads; classmates see it in Race Day | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | 7142610 |
| F-19 | Clearer board lobby: tournament panel, separate class activities | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | f3d9937 |
| F-18 | Race Day: whole-class Robot Racer Grand Prix, three tracks, new racing graphics | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | e47ae9f |
| F-17 | 8-bit chiptune music and sound effects, sound test page | Pushed to `main` Oct 30, 2026; checked on bot-arena-g5ew.onrender.com | f708a94 |
| F-12 | Robot art packs: draw any part from a picture (sample pack, students' own pictures) | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 9a2743b |
| F-10 | Robot Racer: pseudo-3D racing game about motors and gears, class leaderboard | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 091bfc3 |
| F-16 | Flying Car Lab class challenge | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 4025f52 |
| F-08 | Live class mode: present a lesson, quiz cards become class polls | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 54cb2d4 |
| F-07b | PIN-protected teacher status page (`/status`, needs `TEACHER_PIN` on Render) | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 3a03f64 |
| F-05 | Weight classes, best-of-3 matches, lobby game settings (incl. prediction time) | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 358074f |
| F-14 | Brain Challenges and the if-then rules lesson | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 3e3f6a7 |
| F-06 | Custom brain: students program their robot with if-then rules | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 3e2175f |
| F-04 | Wedge, Lidar, Flipper, Drill + automated balance test | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 1531665 |
| F-07 | Who's online: home page counts and class status on the board | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 5dac0a9 |
| F-09 | Anonymous emoji reactions on the board | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 696eb03 |
| F-13 | Robot arm lessons: links and joints, levers and torque | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 36bbfb0 |
| F-03 | Motors unit: DC gears, servos, steppers, with simulators | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 56fc3a6 |
| F-01 | Battle art and animation: per-tool attacks, impact effects, garage arena | Pushed to `main` Oct 25, 2026; checked on bot-arena-g5ew.onrender.com | 723fb06 |
| — | Board music, sensor lessons (ultrasonic, lidar, showdown), lesson audit, tooltips, classroom UX fixes | Pushed to `main` Oct 23, 2026 | cee0c7e |
| — | Self-guided Robot Lessons and maintenance guide | Oct 2026 | 856c05d |

---

## 🔧 How to Use
- **Session start**: read this file, update In Progress
- **Task done**: move to Completed with commit hash
- **Bug found**: add to Active Bugs with today's date
- **Bug fixed + verified**: remove from Active Bugs
- **New idea**: add to Planned with a priority
