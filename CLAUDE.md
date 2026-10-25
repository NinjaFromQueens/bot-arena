# Bot Arena — notes for Claude Code

Classroom robotics battle game for a middle/high school robotics class (Fall Robotics Academy, NYC). Teacher hosts on a projector; students join from Chromebooks/phones.

## Commands
- `npm install` then `npm start` (port 3000, or `PORT`)
- `npm run dev` restarts on file changes
- `npm test` runs bracket + battle determinism, Flying Car Lab, music pattern, sensor lesson, and motor lesson tests
- `npm run balance` prints win rates for every legal build. Run it after ANY change to `PARTS` or battle rules. Target: every part 45–55%, most builds 40–60%, ~11–14 attacks per fight.
- `node test/tune.js 250` hill-climbs the numbers in `PARTS` and prints a suggestion (does not edit files)

## Architecture
- No build step, no framework. Plain Node (Express + Socket.IO) and vanilla browser JS.
- `public/js/engine.js` is UMD and loaded by BOTH the server (`require`) and the browser (`window.Engine`). Keep it free of top-level browser-only calls; anything using `window`/`document` must stay inside functions.
- `Engine.simulate(a, b, seed)` must stay deterministic: only use the seeded `rnd()` inside it, never `Math.random()`. The server decides the winner from the seed and the host replays the same seed. If you change battle rules, both sides update together because they share this file.
- Server state is in memory (`rooms` Map). Restarting the server ends all games. That's acceptable for class use.
- All battle numbers live in `Engine.PARTS` (plus `Engine.TUNE`). Mechanics: dodge, burst (bonus attack), heavy (can't be grabbed), acc, swings, mult, grab, Defensive shield/counter, Smart wait-for-aim. Part `tip` text is shown to students and must stay true; check it against `npm run balance` matchups.
- Socket events: `host:create|resume|start|next|lock|matchDone|kick|reset`, `player:join|update|leave|predict`, `room:check`. Server broadcasts `room:state` and `room:result` (with `correct` predictor ids).
- `Engine.explainBattle(a, b, sim)` turns a fight's events into reasons + a loser-aware tip (`sides[k]`). Used by the host board, practice, and the server (sent to fighters in `room:result.why`). If you add a battle mechanic, add its event flag in `simulate` and a reason/tip here.
- Match flow: `host:next` opens predictions and returns the seed -> host shows the Up Next card -> `host:lock` closes predictions -> host plays the seeded fight -> `host:matchDone` awards prediction points, records stats, and computes awards when the final ends.
- `public/practice.html` + `public/js/practice.js` use the same engine/builder/battle code.
- `public/js/battle.js` (BattleStage) is presentation only: it animates the events `simulate` already decided. Each tool connects at its own moment (`HIT`: gripper 0.2 s, hammer 0.34 s after its wind-up, spinner 0.22 s), with `reachAt`/`hammerAt` for the choreography. Impacts add hit-stop (`freeze`), and crits add a soft flash, a camera punch and a crowd cheer; KOs add slow motion. `drawBot` takes `reach`, `hammer`, `clamp`, `spinA`, `damage` (scars, cracked visor) and `pose: "win"`. The still parts of the garage arena are cached per canvas size in `backdrop()`. Keep shake, flash, zoom, afterimages and camera flashes behind `!RM`.
- Flying Car Lab: `public/js/flight.js` (UMD, deterministic physics + missions + `grade` + `explain`) and `public/lab.html` / `public/js/lab.js` (UI + canvas). Single-device only; progress and design live in localStorage. After changing any number in flight.js run `npm test` (lab.test.js has a saved solution per mission) and `npm run lab` to see how hard each mission is. Explanations must stay true to the sim: if you add a mechanic, add a finding and a tip for it in `explain`/`tipFor`.

- Sensor lessons (Ultrasonic, Lidar, Sensor showdown in `learn.js`): their simulators use `public/js/sensors.js` (UMD). `Sensors.read` decides what each sensor detects and writes the student-facing reason; `Sensors.cast` is the lidar ray caster. Lesson text and quizzes rely on these rules (ultrasonic: soft, tilted, past 4 m; lidar: glass; infrared: glass, black, past 0.8 m), and `test/sensors.test.js` checks them. Change a rule and the tests tell you which lesson claim broke.
- Motor lessons (DC motors and gears, Servo motors, Stepper motors, Pick the right motor in `learn.js`): their simulators use `public/js/motors.js` (UMD). `drive(gear, rampDeg, volts)` is the DC motor + gearbox model (linear torque-speed line, 80% gearbox efficiency), `servoAngle`/`servoStep` the servo (1.0–2.0 ms → 0–180°, feedback loop), `stepperRun` the stepper (200 steps/turn, steps slip past `maxRate` for the load). `test/motors.test.js` checks every claim the lessons and quizzes make (stalls, fastest gear, pulse widths, skipped steps). Volts stay at 3 V and 6 V: small hobby motors are made for about that, and 9 V gave silly speeds.
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
