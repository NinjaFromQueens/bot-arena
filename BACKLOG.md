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
| F-01 | Battle art and animation | Branch `battle-animation`. Per-tool attacks (hammer wind-up and slam, gripper clamp and hold, spinner blur and double hit), hit-stop, crit flash and camera punch, shield-block ripple, dodge afterimage, damage scars, smoke when low, K.O. slow motion, victory poses, garage arena with a cheering crowd. Waiting on teacher review before merging to `main`. |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-02 | Arena backgrounds from Higgsfield | Low | Test 2–3 AI backgrounds against the code-drawn garage. The free plan has 1.05 credits; the illustration model costs 1.25 per image, so this needs more credits first. |
| F-03 | Motors lesson unit | High | DC (speed and gearing), servo (pulse width sets the angle, built-in feedback), stepper (200 steps per turn, skipped steps under load), brushless. Simulators like the sensor lessons, with rules tested like `sensors.test.js`. |
| F-04 | More parts and weapons | High | A 4th or 5th option per slot (flipper, saw, drill, wedge) and maybe an attachment slot. Bot codes need digits above 2 (`parseCode`, `sanitizeBot`). Add an automated balance test that fails if any part leaves 45–55%. |
| F-05 | Weight classes and best-of-3 | Medium | 50 / 75 / 100 kg divisions; best-of-3 in later rounds to cut luck. |
| F-06 | Program your robot's brain | High | Simple if-then rules (for example, "if health < 30, shield") so skill beats luck and students practice logic. |
| F-07 | Online counter and class status | Medium | Anonymous site-wide counts on the home page; names only inside a class game ("Maya: Lesson 4"); a teacher status page behind a PIN. No public name lists or open chat. |
| F-08 | Live class mode for lessons | Medium | Teacher presents a lesson on the board, students follow with the game code, quiz questions become live polls (reuses the prediction system). |
| F-09 | Emoji reactions during battles | Low | Preset emoji buttons on students' devices that pop up on the board. |
| F-10 | Racing mini-game | Medium | Third-person view (three.js or retro fake-3D). Start with time trials and classmates' ghost laps; motor and gear tuning; later a line-following autonomous mode with IR sensors. |
| F-11 | Database for saved progress | Low | Only when needed: class rosters, teacher progress dashboard, season leaderboards. Render's free plan has no persistent storage. |

---

## ✅ Recently Completed
| # | Item | Deployed | Commit |
|---|---|---|---|
| — | Board music, sensor lessons (ultrasonic, lidar, showdown), lesson audit, tooltips, classroom UX fixes | Pushed to `main` Oct 23, 2026 | cee0c7e |
| — | Self-guided Robot Lessons and maintenance guide | Oct 2026 | 856c05d |

---

## 🔧 How to Use
- **Session start**: read this file, update In Progress
- **Task done**: move to Completed with commit hash
- **Bug found**: add to Active Bugs with today's date
- **Bug fixed + verified**: remove from Active Bugs
- **New idea**: add to Planned with a priority
