# Bot Arena

A classroom robotics game for Fall Robotics Academy. Students build a robot on their own device (choosing parts for **Sense**, **Think**, and **Act** under a 75 kg weight limit), join the teacher's game with a 4-letter code, and watch their robots battle in a live single-elimination tournament on the projector.

## How a class session works

1. **Teacher** opens `/host` on the projector. A join code and QR code appear.
2. **Students** go to the site (or scan the QR), type the code and their first name, and build a robot. Their robot pops into the lobby on the board.
3. Teacher clicks **Start tournament**. A bracket is built automatically (byes are handled for any class size).
4. Teacher clicks **Next match** (or turns on **Auto-play**). An **Up Next** card shows both robots, their parts and stats, and a countdown (set with **Predict time**: off, 8, 12 or 20 seconds).
5. While the card is up, every student who isn't fighting **predicts the winner** on their device. The board shows the class split live. Correct picks earn a point, and the **Top Predictors** leaderboard updates, so knocked-out students stay in the game.
6. The battle plays on the board with a Sense/Think/Act log. The two fighters' devices show "YOUR MATCH IS ON THE BOARD!", then "YOU WON!" or "KNOCKED OUT". Predictors see "CORRECT! +1" or "NOT THIS TIME".
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

Other pages:
- `/practice` — single-device mode with the same rules: build, battle by bot code, and the **Flying Car Lab** (thrust vs. weight with a flying Roadster).

Classroom safety: names pass a word filter (it blocks bad words without blocking real names like Michelle, Diego or Cassidy), and the host can remove any robot (hover a robot in the lobby and click ×). No accounts, no student data is stored. Games live in server memory and disappear after 6 idle hours.

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
public/js/practice.js  Single-device practice mode + Flying Car Lab
test/bracket.test.js   Bracket and determinism tests (npm test)
test/balance.js        Every build vs every build win-rate report (npm run balance)
test/tune.js           Automatic balance tuner; prints suggested numbers
```

The server picks a random seed for each match and computes the winner. The host screen replays the exact same fight from that seed, so results can't be changed from a browser.
