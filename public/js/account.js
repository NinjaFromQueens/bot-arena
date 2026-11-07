/* Accounts on the content pages (home, lessons, Lab, practice, Robot Racer, story missions and the map): shows who's signed in, and for a signed-in
   student keeps their saved progress in step with their class account. The pages still save to localStorage exactly as
   before; this copies those keys to the account and back (the server checks them, lib/accounts.js), so progress follows
   the student to any device. Nobody signed in, no accounts on the server, or the offline file: it does nothing. */
(function () {
  if (location.protocol === "file:") return;
  const KEYS = ["learn-progress", "fcl-stars", "fcl-design", "fcl-mission", "rba-challenges", "rba-ch-rules", "race-bests", "race-look", "race-setup", "race-track", "ba-bot", "rba-bot", "cr-record", "cr-missions", "cr-tier"];
  const PENDING = "ba-sync-pending"; // keys saved on this device that the account doesn't have yet
  const MERGED = new Set(["cr-record", "cr-missions"]); // the server merges these with what it has (lib/accounts.js MERGE), so this device's copy is sent, never just replaced
  const NO_RELOAD = ["play"]; // the class game page applies a sync quietly: reloading it would drop the student out of the game for a moment
  const ls = window.localStorage, rawSet = Storage.prototype.setItem;
  const get = (k) => { try { const v = ls.getItem(k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
  const quiet = (k, v) => { try { rawSet.call(ls, k, JSON.stringify(v)); } catch {} }; // a save that isn't a change to send
  const drop = (k) => { try { ls.removeItem(k); } catch {} };
  const pending = () => new Set(get(PENDING) || []);
  // the database may store an object's keys in another order, so compare with the keys sorted
  const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}` : JSON.stringify(v));
  const api = (path, o = {}) => fetch("/api/account" + path, { method: o.method || "GET", credentials: "same-origin", keepalive: !!o.keepalive,
    headers: o.body ? { "Content-Type": "application/json" } : {}, body: o.body && JSON.stringify(o.body) }).then((r) => r.json()).catch(() => ({ ok: false }));

  let me = null, timer = null;
  const ver = {}; // how many times each key changed here, so an answer for an older save doesn't clear a newer one
  async function push(k, keepalive) {
    const v = get(k), at = ver[k] || 0;
    if (v === undefined) return true;
    const r = await api("/progress/" + k, { method: "PUT", body: { value: v }, keepalive });
    if (r.ok && (ver[k] || 0) === at) {
      const p = pending(); p.delete(k); quiet(PENDING, [...p]);
      if (canon(r.value) !== canon(v)) quiet(k, r.value); // the server's checked copy (a racer time driven again, say)
    }
    return r.ok;
  }
  const flush = (keepalive) => { clearTimeout(timer); return Promise.all([...pending()].map((k) => push(k, keepalive))); };
  Storage.prototype.setItem = function (k, v) { // notice the pages' own saves
    rawSet.call(this, k, v);
    if (this === ls && me && me.kind === "student" && KEYS.includes(k)) {
      ver[k] = (ver[k] || 0) + 1;
      const p = pending(); p.add(k); quiet(PENDING, [...p]);
      clearTimeout(timer); timer = setTimeout(flush, 1200);
    }
  };
  addEventListener("pagehide", () => { if (me && me.kind === "student" && pending().size) flush(true); });

  // on each page: anything saved here goes up; anything newer on the account comes down (and the page reloads once)
  async function sync() {
    const r = await api("/progress"); if (!r.ok) return;
    const server = r.progress, p = pending(); let changed = false;
    for (const k of KEYS) {
      const local = get(k);
      if (p.has(k) || (!(k in server) && local !== undefined)) { push(k); continue; }
      if (k in server && MERGED.has(k) && local !== undefined && canon(server[k]) !== canon(local)) { // story progress from both: the server puts them together
        await push(k); if (canon(get(k)) !== canon(local)) changed = true; continue;
      }
      if (k in server && canon(server[k]) !== canon(local)) { quiet(k, server[k]); changed = true; }
    }
    if (changed && !NO_RELOAD.includes(document.body.dataset.page)) {
      let last = 0; try { last = +sessionStorage.getItem("ba-synced") || 0; } catch {}
      if (Date.now() - last > 10000) { try { sessionStorage.setItem("ba-synced", String(Date.now())); } catch {} location.reload(); }
    }
  }
  // right after a student signs in on this device: a brand-new account takes this device's progress along; otherwise the
  // account's progress replaces what's here
  async function signedIn() {
    const r = await api("/progress"); if (!r.ok) return false;
    if (!Object.keys(r.progress).length) { me = { kind: "student" }; for (const k of KEYS) if (get(k) !== undefined) await push(k); }
    else for (const k of KEYS) { if (k in r.progress) quiet(k, r.progress[k]); else drop(k); }
    quiet(PENDING, []);
    return true;
  }
  async function signOut() {
    if (me && me.kind === "student") await flush();
    await api("/logout", { method: "POST" });
    if (me && me.kind === "student") { KEYS.forEach(drop); drop(PENDING); } // the next student on this Chromebook starts fresh
    location.href = me && me.kind === "teacher" ? "/teacher" : "/";
  }

  // who's signed in, at the top of the page
  function chip(cfg) {
    const row = document.querySelector("header.top .headright"), host = row || document.querySelector("header.top");
    if (!host || document.body.dataset.page === "login" || document.body.dataset.page === "teacher") return;
    const box = document.createElement("span"); box.className = "acct";
    if (me) {
      const who = document.createElement("span"); who.className = "acct-who";
      who.textContent = me.kind === "teacher" ? `Teacher: ${me.name}` : `${me.name} · ${me.className}`;
      who.setAttribute("data-tip", me.kind === "teacher" ? "You're signed in as a teacher." : "You're signed in. Your progress is saved to your class account, so it follows you to any device.");
      const b = document.createElement(me.kind === "teacher" ? "a" : "button");
      if (me.kind === "teacher") { b.href = "/teacher"; b.textContent = "Dashboard"; b.setAttribute("data-tip", "Your classes and your students' progress."); }
      else { b.type = "button"; b.textContent = "Sign out"; b.setAttribute("data-tip", "Sign out on this device. Your progress stays saved on your account."); b.onclick = signOut; }
      box.append(who, b);
    } else if (cfg.accounts) {
      const a = document.createElement("a"); a.href = "/login?next=" + encodeURIComponent(location.pathname + location.hash); a.textContent = "Sign in";
      a.setAttribute("data-tip", "Sign in with your class code to save your progress to your class account.");
      box.append(a);
    } else return;
    if (row) row.prepend(box); else host.append(box);
  }

  window.Account = { KEYS, signedIn, signOut, get user() { return me; } };
  (async () => {
    const cfg = await api("/config"); if (!cfg.ok || !cfg.accounts) return;
    document.querySelectorAll("[data-accounts]").forEach((el) => (el.hidden = false)); // links that only make sense with accounts on
    const r = await api("/me"); me = (r.ok && r.user) || null;
    chip(cfg);
    if (me && me.kind === "student" && document.body.dataset.page !== "login") sync();
  })();
})();
