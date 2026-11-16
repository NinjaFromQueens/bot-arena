# Bot Arena — Backlog

Last updated: November 15, 2026

---

## 🔴 Active Bugs
| # | Issue | Status | First seen |
|---|---|---|---|
| — | No active bugs | — | — |

---

## 🟡 In Progress
| # | Feature | Notes |
|---|---|---|
| F-27 | Watch live games and class chat | Branch `watch-and-chat` (from the live site; class accounts stay separate on the `accounts` branch). Built: each fight plays on students' devices in step with the board (after predictions close), Race Day live on game pages for non-racers, quick chat (preset messages only) with bubbles on the board, teacher announcements, and board controls (chat on/off, slow mode, mute, clear, fights on devices). Later, only if wanted: free typing (off by default, filtered, moderated) and a watch link for outsiders (separate code, robot names only). |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-02 | AI art for backgrounds and fighters (Higgsfield) | Medium | **Nov 15:** Higgsfield is now in the toolbox (images, video, 3D models, music, sound effects, voice). About 187 credits on the Plus plan that day. The art each game needs is listed in `docs/games-plan.md` and `docs/racer-plan.md`; the batches are in `docs/schedule.md` (look-test art over winter break). Older note: parked by the teacher. Higgsfield's free plan can't run GPT Image 2.5 ("Requires basic plan or higher"); 1.05 credits left, nothing spent. With a Basic plan: GPT Image 2.5 costs 0.25 (low), 0.5 (medium) or 1.5 (high) per image and can output transparent backgrounds. Plan: robot parts sheets, about 3–5 credits at low quality for all parts. F-12 is done: generated pictures go in `public/art/` with a manifest. |
| F-44 | Game standard: the rules every game and lab follows | High | Written: [docs/game-standard.md](docs/game-standard.md). The game card, rules for the lesson connection (L1–L14), look (A1–A10), sound, engineering and classroom, each with a check, plus templates and checklists. `.claude/CLAUDE.md` points to it. Adopted Nov 15. |
| F-45 | Plan for every game and lab | High | Plan only: [docs/games-plan.md](docs/games-plan.md). Every game scored against the standard, the lesson-to-game map for all lessons, a plan per game, the new games from the bible, the parts to build once, the Phase 1–3 order. Decisions made Nov 15. |
| F-46 | Speed Run: a class math race on the board (first set: Thrust) | High | Plan only: [docs/speed-run-plan.md](docs/speed-run-plan.md). Students solve real Flying Car Lab problems on their devices, fastest right answers win, and the board then launches the answer. Round-by-round and speed-run modes, a solo version in the Lab, a tier per student, kind scoring. Items S-01 to S-08. |
| F-47 | Math track and more physics lessons | High | Plan only: [docs/math-physics-plan.md](docs/math-physics-plan.md). Math lessons M1–M12 (units, ratios, rates, graphs, slopes, chance, formulas, grids, estimating, data, budgets, energy) and physics P8–P14, each tied to a game moment and a Speed Run set, with a draft standards list for F-33. |
| F-48 | Story media production: video, voices, music and sound for every episode | High | Plan only: [docs/story-media-plan.md](docs/story-media-plan.md). Four layers per scene (text and portrait, voice, moving stills, video only for hero moments); the tour's voices kept, Glitch, June and Ezra to cast, one character voiced by the teacher's own voice clone; Higgsfield prices from Nov 15; about 110–200 credits per episode; production steps with sign-offs; scene files and a story player. Scheduled as the MED, ST and EP tasks in `docs/schedule.md`. |
| F-49 | Daily helper: the `/today` briefing | High | Built Nov 15, local only (not part of the site). The `today` skill reads `docs/schedule.md`, BACKLOG.md, `docs/worklog.md` and git; it names each session's task, model, done-when and first step; it logs the day at wrap-up and parks off-plan ideas. A startup hook (`.claude/settings.local.json`, kept out of git) loads the status. Works from the next session. |
| F-43 | Robot Racer plan: lessons meet the game, the story's look, a modern 3D racer | High | Plan only so far: [docs/racer-plan.md](docs/racer-plan.md). Steps are tracked in the Racer section below. Decisions made Nov 15. |
| F-25 | More game ideas (still to build) | Low | Racer ideas moved into F-43 (docs/racer-plan.md). Battles: paint patterns and faces for robots, a fighting-game TV look, an arena per round, live fight on students' phones, class vs boss, 2v2. Both: one "My Robot" for both games, big-text mode. |
| F-11 | Database for saved progress | Low | Only when needed: class rosters, teacher progress dashboard, season leaderboards. Render's free plan has no persistent storage. |

---

## 📅 Schedule

The plans and the schedule live in `docs/`, which is kept private (out of git, backed up by OneDrive) because it holds story spoilers and business plans. The links below work on this computer only.

[docs/schedule.md](docs/schedule.md) gives week-by-week dates for every plan (Racer, all games, Speed Run, math and physics, story media) and the Claude model to use for each task. It assumes about 10 hours a week. Start each session with "good morning" (or `/today`) and the helper picks the task; say "wrap up" at the end and it updates the schedule and [docs/worklog.md](docs/worklog.md).

## 🏁 Robot Racer plan (F-43)

The whole plan is in [docs/racer-plan.md](docs/racer-plan.md): the Nov 15 review, how the lesson meets the game, the art direction (match the story's hand-drawn style, no more 16-bit look), how it's built, the work items (R-01 onward) and nine decisions. This list tracks it.

**Phase 1 (now to winter break)**
- [x] Decisions (made Nov 15, as recommended)
- [x] Step 1: fix what students see now: R-01 road on descents (B-02), R-02 phone layout (B-03), R-03 brake tip (B-04), R-06 branding (with F-32, e6b8ef8), R-07 gear wording
- [ ] Step 2: lesson 7 meets the Racer: missions as data (R-31), the mission screen (R-32, R-16, R-17, R-18), Torque drives and steering help (R-33), the lesson 7 missions (R-34), the gear picture and hills in degrees (R-35)
- [ ] Step 3: the teacher's view of predictions (R-19), after decision 4
- [ ] Step 4: the look test in 3D on a school Chromebook (R-36), the gate for Phase 2

**Phase 2 (January to March)**
- [ ] Step 5: real track loops as Neo Harbor places and the retune, with one lap and medal reset (R-08, R-37, R-38, R-09 to R-14, R-23)
- [ ] Step 6: the 3D race page (R-39 to R-43)
- [ ] Step 7: art for the panoramas, textures, kart sheet, Torque faces and HUD frame (R-44)
- [ ] Step 8: Race Day on the board in 3D (R-45)
- [ ] Step 9: Episode 5: test benches for P2–P4 (R-46), the force meter (R-25), race a Warden racer (R-28), Redline (R-47)

---

## ✅ Recently Completed
| # | Item | Deployed | Commit |
|---|---|---|---|
| R-34 | Lesson 7 links to its missions: "Help Torque test the gears" opens Gear on a hill, then Gear on a straight (which gear has the highest top speed?) and Hill, then straight (which gear finishes first?). "Which gear wins?" is asked once, a table collects every gear's time, and the answer shows only after all four are tried; each finished mission offers the next. The offline lesson opens the offline Racer's missions. Same change on `watch-and-chat`. Still to do from this schedule row: R-35 (gear picture, hills in degrees) | Pushed to `main` Nov 16, 2026; checked on circuitrebels.org (lesson 7 → mission, a four-gear playthrough, gear-hill playthrough, Racer smoke test) | 896a518 |
| R-32, R-16, R-17 | The Racer mission screen at `/race?mission=gear-hill`: Torque's brief, a garage with only the allowed gears and no answer hints, a prediction that locks on Run, a run that ends when the car is stuck, then the verdict, the one-change line, findings with a speed graph and glossary words, and a tip with "Try it". `cards.js` holds the shared cards; open test strips draw flat past both ends (tracks unchanged). Not linked yet (R-34). Same change on `watch-and-chat` (9d5917e) | Pushed to `main` Nov 16, 2026; checked on circuitrebels.org with a full playthrough (4:1 stuck, Try it, 6:1 made it, 24 checks) and the Racer smoke test | 0f2e521 |
| R-31 | The mission engine (`missions.js`) and the Racer's first test bench: `Race.STRIPS` (`strip-hill-22`, 40 m at 21.8°, not in the track list), `Race.MISSION` (`reachTop`, `reachEnd`), the `gear-hill` mission for lesson 7, and `test/missions.test.js` (every allowed choice; too-close answers fail). No visible change yet: the mission screen is R-32. Same change on `watch-and-chat` (8bd0831) | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org (the Racer still lists 3 tracks, a full lap drives, Race Day loads, no errors) | 2704a96 |
| LD-2 | Glossary: `public/data/glossary.json` (60 terms, each with a definition and the lesson that teaches it); bold glossary words in lesson cards show their meaning on hover, tap or focus; `test/glossary.test.js` keeps one word per idea (no "low gear"). Lesson 13 explains everyday weight vs. mass; lesson 7 ends with Robot Racer. Same change on `watch-and-chat` (831d1d3) | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org (only the glossary cards and the two lesson edits changed; tooltips shown on desktop hover and phone tap) | 2e6fd21 |
| LD-1 | Lessons as data: all 16 lessons are files in `public/data/lessons/` (one per lesson, ordered by `index.json`), loaded by the lessons page, with `tiers.js` for reading levels (Recruit fallback), links by id (`#lesson-dcmotor`, old `#lesson-7` still works), the lessons built into the offline copy, and `test/lessons.test.js`. Same change on `watch-and-chat` (38917e6) | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org: all 101 card screenshots match the old page, plus a live-lesson run (board to student and back) locally | 16dc0f1 |
| SP-1 | Spec for the shared parts: mission files, mission engine, predict and explain cards, one-change tracker, tier switch, problem sets, the teacher data message. Six decisions made as recommended (tier from the class setting or the device, never a grade; names on the board only behind a toggle; the teacher sees the first try's prediction). Built in R-31, R-32, R-17, LAB-1, BC-1, R-19 and S-01 | Nov 15, 2026 (private plan, no deploy) | — |
| F-32, R-06 | Rename to Circuit Rebels on every page: game page headers and tab titles, the arena banner, the Racer's trackside billboard, the tour and preview wording, the status page, README and package description. "Bot Arena" stays as the battle game's name. Same change on `watch-and-chat` (000357c) | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org (11 pages at desktop and phone width, no errors, no old name left) | e6b8ef8 |
| MED-1 | Teen voices: Sparrow, Torque, Glitch, June and Ezra cast with young voices that match their genders; the tour's 8 Sparrow and Torque lines re-voiced and leveled to match the rest | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org (all 8 files match, the tour plays them, no errors) | 0a61de6 |
| — | Facebook domain verification tag in the home page's head (a static meta tag; no Facebook script) | Pushed to `main` Nov 15, 2026; live on circuitrebels.org about 40 s later | 78ef8df |
| B-02, B-03, B-04 | Racer fixes: the road on steep descents, the phone layout (pads under the track when upright, a Full screen button), an honest brake tip, and "more gearing / less gearing" wording (R-01, R-02, R-03, R-07) | Pushed to `main` Nov 15, 2026; checked on circuitrebels.org (Neon Peaks descent, fresh browser) | 8f41246 |
| DEC-1 | Decisions for every plan (Racer, games, math and physics, Speed Run, story media), all as recommended, recorded in the private plans | Nov 15, 2026 (no deploy) | — |
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
