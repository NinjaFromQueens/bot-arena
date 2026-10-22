# Bot Arena — notes for Claude Code

Classroom robotics battle game for a middle/high school robotics class (Fall Robotics Academy, NYC). Teacher hosts on a projector; students join from Chromebooks/phones.

## Commands
- `npm install` then `npm start` (port 3000, or `PORT`)
- `npm run dev` restarts on file changes
- `npm test` runs bracket + battle determinism tests

## Architecture
- No build step, no framework. Plain Node (Express + Socket.IO) and vanilla browser JS.
- `public/js/engine.js` is UMD and loaded by BOTH the server (`require`) and the browser (`window.Engine`). Keep it free of top-level browser-only calls; anything using `window`/`document` must stay inside functions.
- `Engine.simulate(a, b, seed)` must stay deterministic: only use the seeded `rnd()` inside it, never `Math.random()`. The server decides the winner from the seed and the host replays the same seed. If you change battle rules, both sides update together because they share this file.
- Server state is in memory (`rooms` Map). Restarting the server ends all games. That's acceptable for class use.
- Socket events: `host:create|resume|start|next|matchDone|kick|reset`, `player:join|update|leave`, `room:check`. Server broadcasts `room:state` and `room:result`.
- `public/practice.html` is a self-contained single page (it was the original prototype) and does not use engine.js.

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
- Flying Car Lab as a multiplayer "highest hop" contest
