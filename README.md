# Bot Arena

A classroom robotics game for Fall Robotics Academy. Students build a robot on their own device (choosing parts for **Sense**, **Think**, and **Act** under a 75 kg weight limit), join the teacher's game with a 4-letter code, and watch their robots battle in a live single-elimination tournament on the projector.

## How a class session works

1. **Teacher** opens `/host` on the projector. A join code and QR code appear.
2. **Students** go to the site (or scan the QR), type the code and their first name, and build a robot. Their robot pops into the lobby on the board.
3. Teacher clicks **Start tournament**. A bracket is built automatically (byes are handled for any class size).
4. Teacher clicks **Next match** (or turns on **Auto-play**). Each battle plays on the board with a Sense/Think/Act log. Each student's device says when their match is on, and shows "YOU WON!" or "KNOCKED OUT" when it ends.
5. The champion gets a podium scene. **New tournament, same robots** runs it again.

Other pages:
- `/practice` — single-device mode: build, battle, and the **Flying Car Lab** (thrust vs. weight with a flying Roadster). Works offline once loaded.

Classroom safety: names pass a basic word filter, and the host can remove any robot (hover a robot in the lobby and click ×). No accounts, no student data is stored. Games live in server memory and disappear after 6 idle hours.

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
public/practice.html   Single-device practice mode + Flying Car Lab
test/bracket.test.js   Bracket and determinism tests (npm test)
```

The server picks a random seed for each match and computes the winner. The host screen replays the exact same fight from that seed, so results can't be changed from a browser.
