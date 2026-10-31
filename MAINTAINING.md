# Maintaining Bot Arena

How to keep the app running, make changes, and send updates to students.

## How it fits together

```
Your computer (or Claude Code)  --git push-->  GitHub repo  --auto deploy-->  Render  -->  students' browsers
```

Render watches your GitHub repo. Every time you push a change to the `main` branch, Render rebuilds and the new version is live in about 2 minutes. Students just refresh.

## Before each class (5 minutes)

1. Open `https://<your-app>.onrender.com/host` about **5 minutes early**. The free plan sleeps after 15 minutes with no visitors and takes about a minute to wake up.
2. Join from one phone or Chromebook with the code to confirm it works on the school wifi.
3. Keep the offline backups (`offline/*.html`) and printed Robot Parts Sheets handy, just in case.

Quick health check: `https://<your-app>.onrender.com/healthz` should show `{"ok":true,...}`.

## Making a change

### With Claude Code (easiest)

1. Open the `bot-arena` folder in Claude Code.
2. Describe the change, e.g. "Make the Hammer a bit less accurate" or "Add a 7th lesson about batteries".
   Claude Code reads `CLAUDE.md`, which explains how the project works and which tests to run.
3. Ask it to run the tests and commit and push. Render deploys automatically.

### By hand

```bash
npm install          # first time only
npm start            # run locally at http://localhost:3000
# ...edit files...
npm test             # must end with "All tests passed", "Lab tests passed", "Music tests passed", "Sensor tests passed"
npm run offline      # rebuild the offline backup files
git add -A
git commit -m "Describe what you changed"
git push             # Render deploys in ~2 minutes
```

## Where things live

| I want to change... | Edit this |
| --- | --- |
| Robot part stats (attack, armor, weight) | `public/js/engine.js` → `PARTS`. Then run `npm test`: it fails if any part leaves 45–55% or a tip's counter claim ("Hammers beat Treads") stops being true. `npm run balance` prints the full report. |
| Custom brain rules (what students can pick, how strong each move is) | `public/js/engine.js` → `RULES` (the IF and THEN choices) and the Custom entry in `PARTS.brain` (the numbers). Add new choices at the END of a list: bot codes store each choice's position. After changing numbers run `node test/tune-brain.js 0` to see the effect, then `npm test`. |
| Brain Challenges (bosses, hints, which fights) | `public/js/challenges.js`. Each challenge lists the student's robot, the boss, the first seed of its 10 fights, and the answer. After editing, or after ANY battle number change, run `npm test`: it says which challenge broke and why. |
| Weight classes | `public/js/engine.js` → `WEIGHT_CLASSES`. Balance is tuned at 75 kg; run `node` with a different limit in `test/balance.js` if you add a class, and check that the parts it rules out don't make the game one-sided. |
| Teacher status page PIN | Render → the service → **Environment** → `TEACHER_PIN`. Change it there; the page at `/status` uses it right after the redeploy. |
| Robot art (pictures for parts) | Put pictures and a `manifest.json` in `public/art/` (copy `public/art-sample/` to start; its README explains the boxes). Run `npm test` to check the manifest. Delete `public/art/` to go back to the coded drawings. |
| Add a new part | Add it at the END of its slot in `PARTS` (old bot codes keep working), draw it in `drawBot`, add its swing timing in `battle.js` (`HIT`, `SPARKS`), add knobs for it in `test/tune.js`, then run `node test/tune.js 300` and copy in the numbers it suggests. |
| Part descriptions students see | `public/js/engine.js` → each part's `d` (short) and `tip` (long) |
| Flying car parts, missions, physics | `public/js/flight.js` → `MATERIALS`, `TANK`, `NOZZLE`, `GEARS`, `MISSIONS`. Then run `npm test` and `npm run lab`. |
| Robot Racer tracks, gears, tires, car physics | `public/js/race.js` → `DEFS` (each track's sections, theme, and the straight/hill/corner its lap report talks about), `GEARS`, `TIRES`, `MOTOR`, `CAR`. Then run `npm test`: it checks every track still rewards the gear it's meant to and that the lap report tells the truth. Colors and scenery per theme: `public/js/racedraw.js` → `THEMES`. |
| Paint shop choices (car bodies, colors, patterns) | `public/js/racedraw.js` → `LOOKS` (names and colors) and `SHAPE` (where each body's parts sit); `public/js/race.js` → `LOOK` (how many of each, which the server checks). Add new choices at the END of a list so saved cars keep their look. Looks never change speed. |
| Medal times | `public/js/race.js` → each track's `par` in `DEFS` (the computer driver's best lap) and `medals` (silver and bronze are 10% and 25% slower). If you change the car or track numbers, `npm test` tells you the new `par` to type in. |
| Race Day points and time limit | `server.js` → `GP_POINTS` (1st, 2nd, ... then 1 for any finish) and `GP_LIMIT` (seconds before a race ends). |
| Flight report wording | `public/js/flight.js` → `explain()` and `tipFor()` |
| "Why ___ won" battle wording | `public/js/engine.js` → `explainBattle()` |
| Lessons (text, questions, answers) | `public/js/learn.js` → `LESSONS`. Each question has `options` and `answer` (0 = first option). |
| Robot arm lesson numbers (link lengths, blocks, servo ratings) | `public/js/arm.js` → `ARM`, `BLOCKS`, `SERVOS`, `WEIGHTS`, `LENGTHS`. Then run `npm test`; it checks the arm lessons still tell the truth. |
| Motor simulator numbers (gearbox, servo, stepper) | `public/js/motors.js` → `DC`, `CART`, `GEARS`, `SERVO`, `STEPPER`. Then run `npm test`; it checks the motor lessons still tell the truth. |
| What each sensor can and can't detect (sensor lesson simulators) | `public/js/sensors.js` → `SENSORS` (range, speed) and `SURFACES` (what fools what). Then run `npm test`; it checks the lessons still tell the truth. |
| Tooltip text (the hint that pops up on hover or tap) | The `data-tip="..."` on that element in the page's HTML, or where the page's JS builds it (`builder.js` for robot parts and stats, `lab.js` for car parts). |
| Background music and sound effects on the board | `public/js/music.js` → `TRACKS` (tempo, chords, note patterns) and `VOL` (overall loudness); sound effects are `fx` inside `Sound` in `public/js/engine.js`. Listen on `/soundtest`. Run `npm test` after editing. |
| Name filter words | `server.js` → `SUB` (blocked anywhere) and `WORD` (blocked as whole words) |
| Colors and fonts | `public/css/style.css` → the `:root` block |
| Home page text | `public/index.html` |

## If an update breaks something

**Roll back in one click.** In the Render dashboard, open your service, go to **Events**, find the last deploy that worked, and click **Rollback**. That puts the old version back right away while you fix the code.

Then fix it locally (or with Claude Code), run `npm test`, and push again.

## Things to know

- **Games live in memory.** If Render restarts the server (a deploy, or a crash), any tournament in progress ends. Don't push updates during class.
- **Lessons, Lab progress, and practice robots are saved on each student's device** (browser storage). Clearing browser data or switching devices starts them fresh. No student data is stored on the server.
- **Free plan limits:** the app sleeps after 15 minutes idle. If the wake-up wait becomes a problem, Render's paid Starter plan keeps it always on.
- **Tests protect you.** `npm test` checks that the bracket works for any class size, battles are fair and repeatable, and every Flying Car mission can still be beaten. If a change makes a mission impossible, the test tells you which one.
- **Offline backups go stale.** After changing anything in `public/`, run `npm run offline` and commit, so the backup files match the live app.

## Ideas for later

See the "Ideas not built yet" list at the bottom of `CLAUDE.md`.
