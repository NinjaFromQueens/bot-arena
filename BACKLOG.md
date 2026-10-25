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
| F-03 | Motors lesson unit | Branch `motors-lessons` (built on `battle-animation`). Four lessons with simulators: DC motors and gears, Servo motors, Stepper motors, Pick the right motor. Rules in `motors.js`, checked by `motors.test.js`. Waiting on teacher review. |
| F-07 | Online counter and class status | Branch `game-features`. Home page counts; class status tags and panel on the board. Done and tested. |
| F-04 | More parts and weapons | Branch `game-features`. Wedge body, Lidar sensor, Flipper and Drill tools with new mechanics (low, glance, track, flip, pierce), drawn and animated in battle. Retuned all parts: 231 builds, every part 49–51%, 87% of builds 40–60%. `test/balance.test.js` runs in `npm test` and checks win rates and every counter claim in the tips. Done and tested. |
| F-09 | Emoji reactions | Branch `game-features`. Done and tested; waiting on review with the other game features. |
| F-13 | Robot arm lessons | Same branch. Links and joints (arm simulator: reach, forward and inverse kinematics) and Arm strength (levers and torque with kg·cm servo ratings). Rules in `arm.js`, checked by `arm.test.js`. Waiting on teacher review. |
| F-01 | Battle art and animation | Branch `battle-animation`. Per-tool attacks (hammer wind-up and slam, gripper clamp and hold, spinner blur and double hit), hit-stop, crit flash and camera punch, shield-block ripple, dodge afterimage, damage scars, smoke when low, K.O. slow motion, victory poses, garage arena with a cheering crowd. Waiting on teacher review before merging to `main`. |

---

## 📋 Planned
| # | Feature | Priority | Notes |
|---|---|---|---|
| F-02 | AI art for backgrounds and fighters (Higgsfield) | Low | Parked by the teacher. Higgsfield's free plan can't run GPT Image 2.5 ("Requires basic plan or higher"); 1.05 credits left, nothing spent. With a Basic plan: GPT Image 2.5 costs 0.25 (low), 0.5 (medium) or 1.5 (high) per image and can output transparent backgrounds. Plan: robot parts sheets, about 3–5 credits at low quality for all parts. Needs F-12 first. |
| F-12 | Parts system for drawn fighters | Medium | Let battle robots be assembled from drawn part images (body, sensor head, arm, tool), recolored in code and animated on the existing skeleton (reach, hammer swing, clamp, spin). Art can then come from Higgsfield, Canva, or students. |
| F-05 | Weight classes and best-of-3 | Medium | 50 / 75 / 100 kg divisions; best-of-3 in later rounds to cut luck. |
| F-06 | Program your robot's brain | High | Simple if-then rules (for example, "if health < 30, shield") so skill beats luck and students practice logic. |
| F-07b | Teacher status page | Low | Server health, active games and the deployed version behind a teacher PIN (split from F-07). |
| F-08 | Live class mode for lessons | Medium | Teacher presents a lesson on the board, students follow with the game code, quiz questions become live polls (reuses the prediction system). |
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
