# Bot Arena — notes for Claude Code

Classroom robotics battle game for a middle/high school robotics class (Fall Robotics Academy, NYC). Teacher hosts on a projector; students join from Chromebooks/phones.

## Commands
- `npm install` then `npm start` (port 3000, or `PORT`)
- `npm run dev` restarts on file changes
- `npm test` runs bracket + battle determinism, Flying Car Lab, music pattern, sensor lesson, motor lesson, and robot arm lesson tests
- `npm run balance` prints win rates for every legal build. Run it after ANY change to `PARTS` or battle rules. Target: every part 45–55%, most builds 40–60%, ~11–14 attacks per fight.
- `node test/tune.js 250` hill-climbs the numbers in `PARTS` and prints a suggestion (does not edit files)

## Architecture
- No build step, no framework. Plain Node (Express + Socket.IO) and vanilla browser JS.
- `public/js/engine.js` is UMD and loaded by BOTH the server (`require`) and the browser (`window.Engine`). Keep it free of top-level browser-only calls; anything using `window`/`document` must stay inside functions.
- `Engine.simulate(a, b, seed)` must stay deterministic: only use the seeded `rnd()` inside it, never `Math.random()`. The server decides the winner from the seed and the host replays the same seed. If you change battle rules, both sides update together because they share this file.
- Server state is in memory (`rooms` Map). Restarting the server ends all games. That's acceptable for class use.
- All battle numbers live in `Engine.PARTS` (plus `Engine.TUNE`). Mechanics: dodge, burst (bonus attack), heavy (can't be grabbed), acc, swings, mult, grab, Defensive shield/counter, Smart wait-for-aim, low (Wedge: can't be flipped), glance (Wedge: spinner damage kept), track (Lidar: share of dodge ignored), spin (Spinner), flip (Flipper: target loses a turn, works on Treads), pierce (Drill: share of armor ignored). New parts go at the END of their slot so old bot codes keep working. `npm test` runs `test/balance.test.js`: every part 45–55%, 10–15 attacks per fight, 70%+ of builds within 40–60%, plus the counter claims the tips make. After changing numbers, `node test/tune.js 300` (update its `KNOBS`/`ORDER` for new parts) and recheck tip text against the claims list. Part `tip` text is shown to students and must stay true; check it against `npm run balance` matchups.
- Socket events: `host:create|resume|start|next|lock|matchDone|kick|reset|reactions`, `player:join|update|leave|predict|react`, `room:check`. Server broadcasts `room:state` and `room:result` (with `correct` predictor ids). Board-only events go through `toHosts(room, ...)` to `room.hosts` (the host's socket ids): `room:react`.
- Presence: `public/js/presence.js` runs on every page (`<body data-page="...">`), reusing the page's socket via `window.baSocket` where it has one, and loading before the page script on lessons/Lab/practice so the first lesson or mission gets reported. It sends `presence:hello {page, n, who, watch}` and `presence:where {n}`: numbers only, never text. `who` is the saved `ba-session` game pass; the server links a device to a student only if the token matches. The home page gets anonymous `presence:counts` (hosts aren't counted), and hosts get `room:status` (playerId -> page + number) through `toHosts`. Pages disconnect on `pagehide` so Back-button caches don't count as online. The offline build strips the Socket.IO tag, so presence does nothing there.
- Reactions: students send an index into `Engine.REACTIONS` (anonymous, never a name), one per student per 1.2 s, ignored in the lobby or when the host switches them off (`room.reactionsOff`, sent to devices as `state.reactions`).
- `Engine.explainBattle(a, b, sim)` turns a fight's events into reasons + a loser-aware tip (`sides[k]`). Used by the host board, practice, and the server (sent to fighters in `room:result.why`). If you add a battle mechanic, add its event flag in `simulate` and a reason/tip here.
- Match flow: `host:next` opens predictions and returns the seed -> host shows the Up Next card -> `host:lock` closes predictions -> host plays the seeded fight -> `host:matchDone` awards prediction points, records stats, and computes awards when the final ends.
- `public/practice.html` + `public/js/practice.js` use the same engine/builder/battle code.
- `public/js/battle.js` (BattleStage) is presentation only: it animates the events `simulate` already decided. Each tool connects at its own moment (`HIT`: gripper 0.2 s, hammer 0.34 s after its wind-up, spinner 0.22 s), with `reachAt`/`hammerAt` for the choreography. Impacts add hit-stop (`freeze`), and crits add a soft flash, a camera punch and a crowd cheer; KOs add slow motion. `drawBot` takes `reach`, `hammer`, `clamp`, `spinA`, `damage` (scars, cracked visor) and `pose: "win"`. The still parts of the garage arena are cached per canvas size in `backdrop()`. Keep shake, flash, zoom, afterimages and camera flashes behind `!RM`.
- Flying Car Lab: `public/js/flight.js` (UMD, deterministic physics + missions + `grade` + `explain`) and `public/lab.html` / `public/js/lab.js` (UI + canvas). Single-device only; progress and design live in localStorage. After changing any number in flight.js run `npm test` (lab.test.js has a saved solution per mission) and `npm run lab` to see how hard each mission is. Explanations must stay true to the sim: if you add a mechanic, add a finding and a tip for it in `explain`/`tipFor`.

- Sensor lessons (Ultrasonic, Lidar, Sensor showdown in `learn.js`): their simulators use `public/js/sensors.js` (UMD). `Sensors.read` decides what each sensor detects and writes the student-facing reason; `Sensors.cast` is the lidar ray caster. Lesson text and quizzes rely on these rules (ultrasonic: soft, tilted, past 4 m; lidar: glass; infrared: glass, black, past 0.8 m), and `test/sensors.test.js` checks them. Change a rule and the tests tell you which lesson claim broke.
- Motor lessons (DC motors and gears, Servo motors, Stepper motors, Pick the right motor in `learn.js`): their simulators use `public/js/motors.js` (UMD). `drive(gear, rampDeg, volts)` is the DC motor + gearbox model (linear torque-speed line, 80% gearbox efficiency), `servoAngle`/`servoStep` the servo (1.0–2.0 ms → 0–180°, feedback loop), `stepperRun` the stepper (200 steps/turn, steps slip past `maxRate` for the load). `test/motors.test.js` checks every claim the lessons and quizzes make (stalls, fastest gear, pulse widths, skipped steps). Volts stay at 3 V and 6 V: small hobby motors are made for about that, and 9 V gave silly speeds.
- Robot arm lessons (Links and joints, Arm strength in `learn.js`): `public/js/arm.js` (UMD). `forward`/`inverse` are 2-link kinematics (18 + 14 cm, shoulder 0–180°, elbow ±150°; "elbow up" means the solution with the higher elbow, worked out geometrically, not by sign). `BLOCKS` are the targets (green and blue reachable, red out of reach on purpose). `holdTorque(kg, cm, angle)` is (block + half the 40 g link) × sideways distance, in kg·cm. `test/arm.test.js` checks the lesson claims (32 cm reach, two solutions for blue, small servo fails at 70° and holds at 75°). In `learn.js` use `E.ease`, not a bare `ease`: it isn't imported there.
- Host-board music: `public/js/music.js` (UMD, browser-only synth, no audio files). Tracks are pattern strings in `TRACKS` (one chord per bar, 16 steps per bar; token key at the top of the file). `host.js` calls `Music.play(scene)`: `garage` in the lobby and between matches, `hype` on the Up Next card, `null` (silence) for the countdown and at each KO, `fight` from the first move, `champion` 1.5 s after the fanfare. `VOL` keeps it under the sound effects. `test/music.test.js` checks every pattern is well-formed.

- `offline/*.html` are generated single-file backups (practice + Lab). Run `npm run offline` after changing anything in `public/` so they stay in sync; never edit them by hand.

## Conventions
- Validate every client payload on the server (`Engine.sanitizeBot`, `cleanBuilder`, name filter).
- Student-facing copy: short, plain sentences, encouraging tone. Kids are roughly grades 5–10.
- Tooltips: every control gets `data-tip="..."` (handled by `public/js/tips.js`, loaded on every page; it works on hover, keyboard focus and touch). Give new buttons and settings a tip, and keep tip text true to the code, like part tips. Controls built in JS set it where they're created (`builder.js`, `lab.js`, `learn.js`, `practice.js`, `host.js`).
- Host keyboard: Space / → / PageDown run Next match (for presentation clickers), ignored while focus is in a form control or button.
- Visual style: dark "garage" theme, orange `#f46524` accent, Chakra Petch / Barlow Semi Condensed / JetBrains Mono. Tokens live in `public/css/style.css`.
- Respect `prefers-reduced-motion` (Engine.RM) for shakes and particles.
- Sound and Music are off by default; their buttons turn them on. Music only plays on the host board, never on students' devices.

## Ideas not built yet
- Persist rooms (Redis) so a server restart doesn't end a game
- Double-elimination or round-robin modes
- Teacher dashboard to tweak part stats live
- Flying Car Lab class mode: host picks a mission, students submit designs, the board replays each attempt and ranks them
- Let the host set the prediction time from the lobby (it's only in the tournament view now)
