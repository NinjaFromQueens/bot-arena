# Bot Arena — notes for Claude Code

Classroom robotics battle game for a middle/high school robotics class (Fall Robotics Academy, NYC). Teacher hosts on a projector; students join from Chromebooks/phones.

## Commands
- `npm install` then `npm start` (port 3000, or `PORT`)
- `npm run dev` restarts on file changes
- `npm test` runs bracket + battle determinism tests
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
- Flying Car Lab: `public/js/flight.js` (UMD, deterministic physics + missions + `grade` + `explain`) and `public/lab.html` / `public/js/lab.js` (UI + canvas). Single-device only; progress and design live in localStorage. After changing any number in flight.js run `npm test` (lab.test.js has a saved solution per mission) and `npm run lab` to see how hard each mission is. Explanations must stay true to the sim: if you add a mechanic, add a finding and a tip for it in `explain`/`tipFor`.

## Conventions
- Validate every client payload on the server (`Engine.sanitizeBot`, `cleanBuilder`, name filter).
- Student-facing copy: short, plain sentences, encouraging tone. Kids are roughly grades 5–10.
- Visual style: dark "garage" theme, orange `#f46524` accent, Chakra Petch / Barlow Semi Condensed / JetBrains Mono. Tokens live in `public/css/style.css`.
- Respect `prefers-reduced-motion` (Engine.RM) for shakes and particles.
- Sound is off by default; the Sound button turns it on.

## Ideas not built yet
- Persist rooms (Redis) so a server restart doesn't end a game
- Double-elimination or round-robin modes
- Teacher dashboard to tweak part stats live
- Flying Car Lab class mode: host picks a mission, students submit designs, the board replays each attempt and ranks them
- Let the host set the prediction time from the lobby (it's only in the tournament view now)
