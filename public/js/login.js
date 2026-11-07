/* Student sign-in: the class code shows the class's names; tap yours, then your 3 pictures (from login cards your teacher
   prints). Then this device's progress and the account's are put together (account.js) and you go where you were headed. */
(function () {
  const $ = (id) => document.getElementById(id), C = window.Catalog, Sound = window.Engine.Sound;
  const show = (id) => ["s-code", "s-name", "s-pics", "s-done", "s-off"].forEach((s) => ($(s).hidden = s !== id));
  const post = (path, body) => fetch("/api/account" + path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({ ok: false, error: "Couldn't reach the server. Check the internet and try again." }));
  const next = (() => { const n = new URLSearchParams(location.search).get("next") || ""; return /^\/(?!\/)/.test(n) ? n : "/learn"; })(); // only pages on this site
  let code = "", student = null, picked = [];

  $("code").addEventListener("input", () => { $("code").value = $("code").value.toUpperCase().replace(/[^A-Z0-9]/g, ""); $("codemsg").textContent = ""; });
  $("codeform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = $("code").value.trim();
    if (c.length !== 6) { $("codemsg").textContent = "Class codes have 6 letters and numbers."; return; }
    const r = await post("/student/lookup", { code: c });
    if (!r.ok) { $("codemsg").textContent = r.error || "Something went wrong. Try again."; return; }
    code = c; Sound.play("click");
    $("classname").textContent = r.className;
    $("names").innerHTML = "";
    if (!r.students.length) { const p = document.createElement("p"); p.className = "small"; p.textContent = "Your teacher hasn't added names to this class yet."; $("names").appendChild(p); }
    r.students.forEach((s) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = s.name; b.setAttribute("data-tip", `I'm ${s.name}.`);
      b.onclick = () => { student = s; picked = []; Sound.play("click"); $("hello").textContent = `Hi, ${s.name}!`; $("picmsg").textContent = ""; slots(); show("s-pics"); };
      $("names").appendChild(b);
    });
    show("s-name");
  });
  $("back1").onclick = () => show("s-code");
  $("back2").onclick = () => show("s-name");
  $("redo").onclick = () => { picked = []; $("picmsg").textContent = ""; slots(); };

  function slots() {
    [...$("slots").children].forEach((el, i) => { el.textContent = picked[i] != null ? C.PICS[picked[i]][0] : ""; el.className = picked[i] != null ? "on" : ""; });
  }
  C.PICS.forEach(([emoji, name], i) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = emoji; b.setAttribute("aria-label", name); b.setAttribute("data-tip", name[0].toUpperCase() + name.slice(1));
    b.onclick = async () => {
      if (picked.length >= C.PIC_LEN) return;
      picked.push(i); slots(); Sound.play("beep");
      if (picked.length < C.PIC_LEN) return;
      const r = await post("/student/login", { code, studentId: student.id, pics: picked });
      if (!r.ok) {
        $("picmsg").textContent = r.error || "Something went wrong. Try again.";
        $("slots").classList.remove("shake"); void $("slots").offsetWidth; $("slots").classList.add("shake");
        Sound.play("miss"); picked = []; setTimeout(slots, 350);
        return;
      }
      Sound.play("win");
      $("welcome").textContent = `You're in, ${r.name}!`; show("s-done");
      await window.Account.signedIn();
      $("donemsg").textContent = "Your progress is ready.";
      location.href = next;
    };
    $("pics").appendChild(b);
  });

  // accounts off on this server, or already signed in
  fetch("/api/account/config").then((r) => r.json()).then(async (cfg) => {
    if (!cfg.ok || !cfg.accounts) return show("s-off");
    const me = await fetch("/api/account/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
    if (me.ok && me.user && me.user.kind === "student") {
      $("welcome").textContent = `You're signed in as ${me.user.name}.`;
      $("donemsg").innerHTML = '<a class="btn big" id="go"></a> <button class="btn ghost big" type="button" id="out" data-tip="Sign out, so someone else can sign in on this device.">Sign out</button>';
      $("go").textContent = "Keep going"; $("go").href = next; $("go").setAttribute("data-tip", "Go back to what you were doing.");
      $("out").onclick = () => window.Account.signOut();
      show("s-done");
    }
  }).catch(() => show("s-off"));
})();
