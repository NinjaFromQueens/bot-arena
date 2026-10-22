// Single-elimination bracket with byes. Pure functions, no I/O, easy to test.

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ids: player ids (at least 2). Returns { rounds: [[{id,a,b,winner}]] }.
// Byes only happen in round 1 and every bye is paired with a real player.
function createBracket(ids, rnd = Math.random) {
  if (ids.length < 2) throw new Error("Need at least 2 players");
  const order = shuffle(ids, rnd);
  let size = 2;
  while (size < order.length) size *= 2;
  const half = size / 2, fullMatches = order.length - half;
  const rounds = [];
  const r0 = [];
  for (let i = 0; i < half; i++) {
    r0.push({ id: `r0m${i}`, a: order[i], b: i < fullMatches ? order[half + i] : null, winner: null, bye: i >= fullMatches });
  }
  rounds.push(r0);
  for (let n = half / 2, r = 1; n >= 1; n /= 2, r++) {
    rounds.push(Array.from({ length: n }, (_, i) => ({ id: `r${r}m${i}`, a: null, b: null, winner: null })));
  }
  const br = { rounds };
  r0.forEach((m, i) => { if (m.bye) setWinner(br, 0, i, m.a); });
  return br;
}

function setWinner(br, r, m, winnerId) {
  const match = br.rounds[r][m];
  match.winner = winnerId;
  if (r + 1 < br.rounds.length) {
    const next = br.rounds[r + 1][Math.floor(m / 2)];
    if (m % 2 === 0) next.a = winnerId; else next.b = winnerId;
  }
}

function findMatch(br, matchId) {
  for (let r = 0; r < br.rounds.length; r++) {
    const m = br.rounds[r].findIndex((x) => x.id === matchId);
    if (m >= 0) return { r, m, match: br.rounds[r][m] };
  }
  return null;
}

// Next playable match: both sides known, no winner yet. Earlier rounds first.
function nextMatch(br) {
  for (let r = 0; r < br.rounds.length; r++) {
    for (let m = 0; m < br.rounds[r].length; m++) {
      const x = br.rounds[r][m];
      if (x.a && x.b && !x.winner) return { r, m, match: x };
    }
  }
  return null;
}

function champion(br) {
  const last = br.rounds[br.rounds.length - 1][0];
  return last.winner || null;
}

function roundName(br, r) {
  const left = br.rounds.length - r;
  if (left === 1) return "Final";
  if (left === 2) return "Semifinal";
  if (left === 3) return "Quarterfinal";
  return `Round ${r + 1}`;
}

module.exports = { createBracket, setWinner, findMatch, nextMatch, champion, roundName, shuffle };
