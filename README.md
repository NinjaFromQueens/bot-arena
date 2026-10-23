# Bot Arena

A classroom robotics game for Fall Robotics Academy. Students build a robot on their own device (choosing parts for **Sense**, **Think**, and **Act** under a 75 kg weight limit), join the teacher's game with a 4-letter code, and watch their robots battle in a live single-elimination tournament on the projector.

## How a class session works

1. **Teacher** opens `/host` on the projector. A join code and QR code appear.
2. **Students** go to the site (or scan the QR), type the code and their first name, and build a robot. Their robot pops into the lobby on the board.
3. Teacher clicks **Start tournament**. A bracket is built automatically (byes are handled for any class size).
4. Teacher clicks **Next match** (or turns on **Auto-play**). An **Up Next** card shows both robots, their parts and stats, and a countdown (set with **Predict time**: off, 8, 12 or 20 seconds).
5. While the card is up, every student who isn't fighting **predicts the winner** on their device. The board shows the class split live. Correct picks earn a point, and the **Top Predictors** leaderboard updates, so knocked-out students stay in the game.
6. The battle plays on the board with a Sense/Think/Act log. The two fighters' devices show "YOUR MATCH IS ON THE BOARD!", then "YOU WON!" or "KNOCKED OUT". Predictors see "CORRECT! +1" or "NOT THIS TIME".
6b. After each battle a **"Why ___ won"** card appears on the board: 2–3 reasons taken from what actually happened (hit rates, damage per hit, number of attacks, grabs, dodges, shields, bonus speed attacks) and one tip for the loser that suggests a part they don't already have. The two fighters see it on their own devices ("Why you won" / "Try this"). Auto-play waits 7 seconds so the class can read it. When a fight was nearly even, the card says so: a rematch could go the other way.
7. The champion gets a podium scene, then **Awards**: Champion, Runner-up, Heavy Hitter, Sharpshooter, Grab Master, Speed Demon, Shield Hero and Top Predictor (ties share the award). Students see their own awards on their device. **New tournament, same robots** runs it again.

## The parts (balanced)

Every part has a strength and a weakness, and all 75 legal builds were tested against each other (`npm run balance`). Every part wins 47–53% of its fights overall, so there is no "best build", only good matchups.

| Part | Strength | Weakness |
|---|---|---|
| Wheels | Fast, 30% chance of a bonus speed attack | Almost no armor |
| Treads | Heavy armor, can't be grabbed | Slow, easy to hit |
| Legs | Hard to hit | Medium armor |
| Camera | Best aim | Heaviest sensor |
| Ultrasonic | Okay aim, helps dodge | |
| Touch | Lightest, extra armor | Weak aim |
| Aggressive | Hits harder | Less armor |
| Defensive | Raises a shield when hurt, then counterattacks | |
| Smart | Waits for a clear shot when aim is low | |
| Gripper | Accurate, can grab (enemy loses a turn) | Weak hits, can't grab Treads |
| Hammer | Huge hits, beats Treads | Misses a lot, struggles vs Wheels |
| Spinner | Two hits per turn, steady all-rounder | |

## Flying Car Lab (`/lab`)

Inspired by the October 2026 flying Roadster demo. Students engineer a car that drives up a ramp and flies with cold-gas (compressed air) thrusters.

**What they choose:** body material (plastic, aluminum, steel, carbon fiber: weight vs. strength vs. cost), air tanks, lift / push / flip nozzles, flight computer (none, Stabilizer, Pro), landing gear, passengers, ramp speed and angle, how much air to save for a landing cushion, and whether to backflip.

**Missions (3 stars each: complete, smooth landing, an efficiency goal):**
1. First Flight: stay up 2 seconds
2. Car Hop: clear a parked sedan
3. Semi Jump: clear a 4 m tall, 20 m long semi truck with trailer
4. Backflip
5. Five in a Row: robotaxi, pickup, semi truck, SUV and sedan, like the real demo
6. Semi Flip: clear the semi with a backflip
7. Passenger Safety: 2 passengers, landing under 6 g
8. Budget Engineer: clear the semi for under $150,000

**The flight report** explains every result with the real numbers: thrust vs. weight, how long the air lasted, peak height vs. what was needed ("higher isn't always better: from 13 m you hit the ground at 16 m/s"), why a flip didn't finish (inertia, air, time), landing speed vs. what the gear and body can take, g-force on passengers, and how the flight computer used Sense, Think, Act. It ends with one specific "Try this next" tip and compares the flight to the previous attempt. The previous flight's path stays on screen as a ghost line.

The physics (`public/js/flight.js`) is a deterministic 2D simulation: gravity, thrust, air mass flow (the car gets lighter as air leaves), ramp launch, pitch and rotational inertia, thrust vectoring by the flight computer, a landing cushion timed by the computer, collisions with each vehicle, and landing impact. Numbers are simplified for the classroom.

Other pages:
- `/practice` — single-device robot building and battles with the same rules as the tournament.

Classroom safety: names pass a word filter (it blocks bad words without blocking real names like Michelle, Diego or Cassidy), and the host can remove any robot (hover a robot in the lobby and click ×). No accounts, no student data is stored. Games live in server memory and disappear after 6 idle hours.

## Backup plan (if students can't join)

| Problem | What to do |
| --- | --- |
| One student can't join | Check the 4-letter code (no I or O) or scan the QR. A refresh rejoins them with the same robot. |
| Students arrive after you start | Click **New tournament, same robots**. It reopens the lobby and keeps everyone's robots. |
| Live connection fails for the class, site still loads | Use `/practice`: students build and read you their bot code; you type codes into the Arena tab on the projector and draw the bracket on the board. |
| Site is down or blocked | Double-click `offline/bot-arena-offline.html` (works with no internet). Students fill out the paper Robot Parts Sheet and you type their codes in. `offline/flying-car-lab-offline.html` is the Lab. |

Rebuild the offline files after any change with `npm run offline`.

## Run it locally

Requires Node 18 or newer.

```bash
npm install
npm start
# open http://localhost:3000/host on the teacher computer
```

Students on the **same network** can join at `http://<teacher-computer-ip>:3000`. School networks often block device-to-device traffic, so for class use deploy it online (below).

## Put it online (free)

### Render (recommended)
1. Push this folder to a GitHub repo.
2. In [Render](https://render.com), choose **New → Blueprint** and pick the repo. `render.yaml` sets everything up.
3. Use the `https://<your-app>.onrender.com` link in class.

Note: Render's free plan sleeps after 15 minutes without visitors. Open the host page a couple of minutes before class so it is awake.

### Other hosts
Any host that runs a Node web server with WebSockets works (Railway, Fly.io, a small VPS). Start command: `npm start`. The app reads the `PORT` environment variable. Serverless hosts like Vercel or Netlify won't work, because the game needs a long-running server.

## Project layout

```
server.js              Express + Socket.IO: rooms, join codes, bracket, match results
lib/tournament.js      Single-elimination bracket with byes (pure functions)
public/js/engine.js    Shared by server and browser: parts, stats, seeded battle sim, robot drawing, effects, sound
public/js/battle.js    BattleStage: animated arena used on the host board
public/js/builder.js   Robot builder UI used on the student page
public/js/host.js      Teacher board logic
public/js/play.js      Student device logic
public/js/practice.js  Single-device practice mode
public/js/flight.js    Flying Car Lab physics, missions, grading and flight-report explanations (shared with tests)
public/js/lab.js       Flying Car Lab page: builder, animation, report
test/bracket.test.js   Bracket and determinism tests (npm test)
test/balance.js        Every build vs every build win-rate report (npm run balance)
test/tune.js           Automatic balance tuner; prints suggested numbers
test/lab.test.js       Every Lab mission stays solvable; loopholes stay closed (part of npm test)
test/lab-explore.js    Samples thousands of car designs per mission (npm run lab)
test/lab-refs.js       Runs "typical student" designs and prints outcomes and tips
```

The server picks a random seed for each match and computes the winner. The host screen replays the exact same fight from that seed, so results can't be changed from a browser.
