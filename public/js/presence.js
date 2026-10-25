/*
 * Live presence: tells the server which page this device is on, plus a lesson or mission number,
 * and fills in "N online now" on pages that have an #online element.
 * Students who joined a game also send their saved game pass, so the teacher's board can show
 * "LESSON 6" next to their name. Only numbers are sent, never text.
 * Does nothing in the offline backups (no server, no Socket.IO).
 */
(function () {
  if (!window.io || location.protocol === "file:") { window.Presence = { where() {} }; return; }
  const page = document.body.dataset.page;
  const socket = window.baSocket || io(); // reuse the page's own connection when it has one
  let n = 0;
  const pass = () => { try { const s = JSON.parse(localStorage.getItem("ba-session")); return s && s.code && s.playerId && s.token ? { code: s.code, playerId: s.playerId, token: s.token } : null; } catch { return null; } };
  const hello = () => socket.emit("presence:hello", { page, n, who: page === "play" ? null : pass(), watch: !!document.getElementById("online") });
  socket.on("connect", hello);
  if (socket.connected) hello();
  socket.on("presence:counts", (c) => {
    const el = document.getElementById("online"); if (!el) return;
    const bits = [`<b>${c.online}</b> online now`];
    if (c.play) bits.push(`${c.play} in games`);
    if (c.learn) bits.push(`${c.learn} in lessons`);
    if (c.lab) bits.push(`${c.lab} in the Lab`);
    if (c.practice) bits.push(`${c.practice} practicing`);
    if (c.live) bits.push(`${c.live} tournament${c.live === 1 ? "" : "s"} live`);
    el.innerHTML = `<i></i>${bits.join(" · ")}`; el.hidden = false;
  });
  // Browsers keep recent pages alive for the Back button; a page left that way shouldn't count as online.
  addEventListener("pagehide", () => socket.disconnect());
  addEventListener("pageshow", (e) => { if (e.persisted) socket.connect(); });
  window.Presence = { where(num) { n = num | 0; socket.emit("presence:where", { n }); } };
})();
