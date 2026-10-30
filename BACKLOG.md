# Bot Arena — Backlog

Last updated: October 24, 2026

---

## 🔴 Active Bugs
| # | Issue | Status | First seen |
|---|---|---|---|
| — | No active bugs | — | — |

---

## 🟡 In Progress
| # | Feature | Notes |
|---|---|---|
| F-17 | Chiptune music and sound effects | Branch `chiptune-sound`. Original 8-bit console-style music (two pulse leads, triangle bass, NES-style noise drums, arpeggios, echo) for the board scenes, matching sound effects, and a sound test page. |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-02 | AI art for backgrounds and fighters (Higgsfield) | Low | Parked by the teacher. Higgsfield's free plan can't run GPT Image 2.5 ("Requires basic plan or higher"); 1.05 credits left, nothing spent. With a Basic plan: GPT Image 2.5 costs 0.25 (low), 0.5 (medium) or 1.5 (high) per image and can output transparent backgrounds. Plan: robot parts sheets, about 3–5 credits at low quality for all parts. F-12 is done: generated pictures go in `public/art/` with a manifest. |
| F-11 | Database for saved progress | Low | Only when needed: class rosters, teacher progress dashboard, season leaderboards. Render's free plan has no persistent storage. |

---

## ✅ Recently Completed
| # | Item | Deployed | Commit |
|---|---|---|---|
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
