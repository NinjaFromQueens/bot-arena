# Bot Arena — Backlog

Last updated: October 30, 2026

---

## 🔴 Active Bugs
| # | Issue | Status | First seen |
|---|---|---|---|
| — | No active bugs | — | — |

---

## 🟡 In Progress
| # | Feature | Notes |
|---|---|---|
| F-20 | Robot Racer paint shop | Branch `game-upgrades`. Students customize their car: two colors, a livery (stripe, flames, checkers, lightning, dots), a race number, body style (kart, F1, buggy, truck, hover pod), wheels, wing, trail color, and their battle robot as the driver. Looks only (gear and tires stay the only performance choices). Saved on the device as a short look code; the server checks it so classmates see your car in Race Day. |
| F-21 | Racer teaching HUD | Branch `game-upgrades`. A hill profile strip under the track map (where the climbs are, where you are), a speed and rpm dial with a red line, and a chiptune motor sound whose pitch follows rpm, so students see and hear a gear run out of torque. |
| F-22 | Battle stage: a look per sensor | Branch `game-upgrades`. The stage shows one generic scan beam today. Give each sensor its own: ultrasonic rings, a sweeping lidar laser, a camera lens flash, touch whiskers. Presentation only (battle.js), so results can't change. |
| F-23 | Replay any finished match | Branch `game-upgrades`. Click a finished match in the bracket to watch it again (fights are seeded, so the server only needs to keep each match's seed). |
| F-24 | Racer medals | Branch `game-upgrades`. Bronze, silver and gold times on each track, set from the computer driver's best. |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-02 | AI art for backgrounds and fighters (Higgsfield) | Low | Parked by the teacher. Higgsfield's free plan can't run GPT Image 2.5 ("Requires basic plan or higher"); 1.05 credits left, nothing spent. With a Basic plan: GPT Image 2.5 costs 0.25 (low), 0.5 (medium) or 1.5 (high) per image and can output transparent backgrounds. Plan: robot parts sheets, about 3–5 credits at low quality for all parts. F-12 is done: generated pictures go in `public/art/` with a manifest. |
| F-25 | More game ideas (still to build) | Low | Racer: turning sprites and body roll, curbs, a lap replay with trackside cameras, multi-lap Race Day, new tracks (ice rink, city streets, mountain pass), rain that lowers grip, a track builder, unlockable stickers for the paint shop. Battles: paint patterns and faces for robots, a fighting-game TV look, an arena per round, live fight on students' phones, class vs boss, 2v2. Both: one "My Robot" for both games, big-text mode. (Skid marks were tried and dropped: with the low camera they sit behind your own kart.) |
| F-11 | Database for saved progress | Low | Only when needed: class rosters, teacher progress dashboard, season leaderboards. Render's free plan has no persistent storage. |

---

## ✅ Recently Completed
| # | Item | Deployed | Commit |
|---|---|---|---|
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
