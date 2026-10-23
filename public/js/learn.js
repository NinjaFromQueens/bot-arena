/* Self-guided lessons: one card at a time, an interactive in each lesson, check questions, saved progress. */
(function () {
  const E = window.Engine, F = window.Flight;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let progress = ls.get("learn-progress", {});

  // ---------------- lessons ----------------
  // step types: read (html), quiz {q, options, answer, explain}, interactive {kind}
  const LESSONS = [
    {
      id: "robot", n: "What makes a robot?", about: "Sense, Think, Act: the three things every robot does.",
      steps: [
        { type: "read", html: `<p class="big">A robot is a machine that can <b>Sense</b>, <b>Think</b>, and <b>Act</b>, all on its own.</p>
          <div class="stack3"><div class="sta s"><b>Sense</b><span>Notice the world with sensors, like a camera or a touch sensor.</span></div>
          <div class="sta t"><b>Think</b><span>A computer decides what to do, like a Raspberry Pi.</span></div>
          <div class="sta a"><b>Act</b><span>Do something: drive wheels, move an arm, fire thrusters.</span></div></div>` },
        { type: "read", html: `<h3>Example: a robot vacuum</h3>
          <ul><li><b>Sense:</b> bump sensors feel walls, and cliff sensors notice stairs.</li>
          <li><b>Think:</b> its computer decides where to go next.</li>
          <li><b>Act:</b> wheels drive and brushes clean.</li></ul>
          <p>If a machine is missing one of these, or a person has to make every decision, it isn't a robot.</p>` },
        { type: "interactive", kind: "robotornot" },
        { type: "quiz", q: "A robot's computer (like the Raspberry Pi on our robot arm) is which part?", options: ["Sense", "Think", "Act"], answer: 1, explain: "The computer makes the decisions. That's the Think part." },
        { type: "quiz", q: "The robot arm's camera spots a red block. Which part is that?", options: ["Sense", "Think", "Act"], answer: 0, explain: "Seeing the block is sensing. Then the computer thinks, and the servos act." },
      ],
      next: { label: "Build your first robot", href: "/practice" },
    },
    {
      id: "sensors", n: "Robot senses", about: "Cameras, ultrasonic, touch and gyro sensors, and how they work.",
      steps: [
        { type: "read", html: `<p class="big">Sensors are a robot's senses.</p>
          <ul><li><b>Camera:</b> sees colors and shapes, like your eyes.</li>
          <li><b>Ultrasonic:</b> measures distance with sound you can't hear, like a bat.</li>
          <li><b>Touch:</b> feels when it bumps into something.</li>
          <li><b>Gyro:</b> feels tilting and turning, like your inner ear.</li></ul>` },
        { type: "read", html: `<h3>How an ultrasonic sensor measures distance</h3>
          <p>It sends out a short beep and times how long the echo takes to come back. Sound travels about <b>343 meters per second</b>.</p>
          <p>The sound goes there <i>and</i> back, so: <b>distance = 343 × time ÷ 2</b>.</p>
          <p>Example: the echo comes back in 0.01 seconds. 343 × 0.01 ÷ 2 ≈ <b>1.7 meters</b> to the wall.</p>` },
        { type: "interactive", kind: "match" },
        { type: "quiz", q: "An ultrasonic echo comes back in 0.02 seconds. About how far away is the wall?", options: ["0.7 m", "3.4 m", "6.9 m", "343 m"], answer: 1, explain: "343 × 0.02 = 6.86 meters there and back. Divide by 2: about 3.4 m." },
        { type: "quiz", q: "In Bot Arena, which sensor gives a robot the best aim?", options: ["Camera", "Ultrasonic", "Touch"], answer: 0, explain: "The camera sees the target clearly. Ultrasonic helps you dodge, and Touch is light but aims poorly." },
      ],
      next: { label: "Pick a sensor for your robot", href: "/practice" },
    },
    {
      id: "tradeoffs", n: "Weight and trade-offs", about: "Why engineers can't have everything, and how a weight limit forces choices.",
      steps: [
        { type: "read", html: `<p class="big">Engineers can't have everything. Every choice gives something and costs something.</p>
          <p>That's called a <b>trade-off</b>. In Bot Arena, every part has a weight, and the motors can only carry <b>75 kg</b>.</p>
          <p>Heavy parts like Treads and the Hammer are strong. But you can't put every strong part on one robot.</p>` },
        { type: "interactive", kind: "budget" },
        { type: "quiz", q: "Treads (40 kg) + Camera (10 kg) + Hammer (30 kg) = 80 kg. That's too heavy. Which change does NOT fix it?", options: ["Swap the Camera for Touch (2 kg)", "Swap the Hammer for a Spinner (20 kg)", "Swap the Aggressive brain for the Smart brain", "Swap the Treads for Legs (30 kg)"], answer: 2, explain: "Brains weigh 0 kg, so swapping brains doesn't change the weight. All the other swaps get under 75 kg." },
        { type: "quiz", q: "What is a trade-off?", options: ["A part that is always the best", "Getting more of one thing by giving up some of another", "Trading robots with a friend"], answer: 1, explain: "Like Treads: more armor, but slower and heavier. Every part in the game is a trade-off." },
      ],
      next: { label: "Build a robot under 75 kg", href: "/practice" },
    },
    {
      id: "thrust", n: "Thrust vs. weight", about: "How a car can fly: Newton's 3rd Law and the thrust-to-weight ratio.",
      steps: [
        { type: "read", html: `<p class="big">To fly, push air down hard enough that the air pushes you up.</p>
          <p>That's <b>Newton's 3rd Law</b>: every push has an equal push back. Let go of a blown-up balloon and it shoots away as the air rushes out.</p>
          <p>The flying car shown in October 2026 used <b>compressed-air thrusters</b>: tanks of squeezed air blasting out of nozzles.</p>` },
        { type: "read", html: `<h3>Thrust-to-weight</h3>
          <p><b>Weight</b> is how hard gravity pulls: mass × 9.8. A 1,000 kg car weighs about 9.8 kN (kilonewtons).</p>
          <p><b>Thrust-to-weight = thrust ÷ weight.</b></p>
          <ul><li>Above 1.0: the thrusters can lift the car by themselves.</li><li>Below 1.0: they can only slow its fall.</li></ul>` },
        { type: "interactive", kind: "thrust" },
        { type: "quiz", q: "A car weighs 12 kN. Its nozzles push with 9 kN. Can the thrusters lift it by themselves?", options: ["Yes", "No"], answer: 1, explain: "9 ÷ 12 = 0.75. That's below 1.0, so gravity wins." },
        { type: "quiz", q: "Which change raises thrust-to-weight?", options: ["Add two passengers", "Switch from a steel body to carbon fiber", "Remove some nozzles", "Add heavy armor"], answer: 1, explain: "Carbon fiber is much lighter than steel. Same thrust, less weight, so the ratio goes up." },
      ],
      next: { label: "Try Mission 1 in the Flying Car Lab", href: "/lab" },
    },
    {
      id: "landing", n: "Higher isn't always better", about: "Why flying too high makes a crash landing, and the math behind it.",
      steps: [
        { type: "read", html: `<p class="big">The higher something falls, the faster it hits the ground.</p>
          <p>Speed when it lands ≈ <b>√(2 × 9.8 × height)</b>.</p>
          <p>It isn't simple doubling. Falling from <b>4 times</b> as high makes it hit only <b>2 times</b> as fast. But that's still a lot harder.</p>` },
        { type: "interactive", kind: "falling" },
        { type: "quiz", q: "To clear a 4 m semi truck you need about 5 m of height. Your car flew to 13 m and crashed when it landed. What's the best fix?", options: ["Add more nozzles", "Add more air tanks", "Use less thrust so it flies lower", "Go faster up the ramp"], answer: 2, explain: "You only needed 5 m. Flying lower means hitting the ground slower. Engineers use just enough power, not the most." },
        { type: "quiz", q: "If you drop something from 4 times as high, it hits the ground about...", options: ["the same speed", "2 times as fast", "4 times as fast", "16 times as fast"], answer: 1, explain: "Speed grows with the square root of height. √4 = 2." },
      ],
      next: { label: "Try the Semi Jump in the Lab", href: "/lab" },
    },
    {
      id: "engineer", n: "Think like an engineer", about: "Predict, test, explain, improve. And why you change one thing at a time.",
      steps: [
        { type: "read", html: `<p class="big">Engineers don't guess. They follow a cycle.</p>
          <ol style="margin:0;padding-left:22px;display:grid;gap:6px;font-size:18px"><li><b>Predict:</b> "If I change this, I think that will happen, because..."</li>
          <li><b>Test:</b> try it.</li><li><b>Explain:</b> why did it happen? (The flight report helps.)</li><li><b>Improve:</b> change something and test again.</li></ol>` },
        { type: "read", html: `<h3>The fair test rule</h3>
          <p>Change only <b>one thing</b> at a time. If you change two things and the result changes, you can't tell which one caused it.</p>` },
        { type: "quiz", q: "Maya changed her car's body to carbon fiber AND added 4 nozzles. It flew higher. Which change made it fly higher?", options: ["The carbon fiber", "The nozzles", "We can't tell, because she changed two things"], answer: 2, explain: "Both changes could raise the height. To know for sure, change one at a time." },
        { type: "quiz", q: "Leo's car crashed. What should he do first?", options: ["Change everything", "Read the flight report to find out why", "Give up", "Pick random parts"], answer: 1, explain: "The report tells you what went wrong, so your next change has a reason." },
        { type: "quiz", q: "Which is the best prediction?", options: ["It will be cool.", "If I add 2 lift nozzles, the car will fly higher, because thrust goes up.", "I don't know.", "My car will win."], answer: 1, explain: "A good prediction says what will change, and why." },
      ],
      next: { label: "Use the cycle in the Flying Car Lab", href: "/lab" },
    },
  ];

  // ---------------- list ----------------
  function renderList() {
    const el = $("lessons"); el.innerHTML = "";
    let done = 0;
    LESSONS.forEach((L, i) => {
      const p = progress[L.id]; if (p && p.done) done++;
      const b = document.createElement("button"); b.type = "button"; b.className = "lcard" + (p && p.done ? " done" : "");
      b.innerHTML = `<span class="num">LESSON ${i + 1}</span><h2></h2><p></p><span class="meta"><span>About 5 min</span>${p && p.done ? `<span class="badge">Done ✓ ${p.score}/${p.total}</span>` : ""}</span>`;
      b.querySelector("h2").textContent = L.n; b.querySelector("p").textContent = L.about;
      b.onclick = () => openLesson(i);
      el.appendChild(b);
    });
    $("pbar").style.width = (done / LESSONS.length) * 100 + "%";
    $("ptext").textContent = `${done} of ${LESSONS.length} lessons done`;
  }

  // ---------------- lesson view ----------------
  let cur = null; // { i, step, score, answered:{}, doneSteps:Set }
  function openLesson(i) {
    cur = { i, step: 0, score: 0, total: LESSONS[i].steps.filter((s) => s.type === "quiz").length, answered: {}, ok: {} };
    $("v-list").hidden = true; $("v-lesson").hidden = false;
    try { history.replaceState(null, "", "#lesson-" + (i + 1)); } catch {}
    renderStep(); window.scrollTo(0, 0);
  }
  function closeLesson() {
    cur = null; $("v-list").hidden = false; $("v-lesson").hidden = true;
    try { history.replaceState(null, "", location.pathname); } catch {}
    renderList();
  }
  $("back").onclick = closeLesson;
  $("prev").onclick = () => { if (cur && cur.step > 0) { cur.step--; renderStep(); } };
  $("next").onclick = () => {
    if (!cur) return;
    const L = LESSONS[cur.i];
    if (cur.step < L.steps.length) { cur.step++; renderStep(); }
    else if (cur.i < LESSONS.length - 1) openLesson(cur.i + 1);
    else closeLesson();
  };
  function setNext(enabled) { $("next").disabled = !enabled; }

  function renderStep() {
    const L = LESSONS[cur.i], card = $("card"), n = L.steps.length;
    $("ltitle").textContent = `Lesson ${cur.i + 1}: ${L.n}`;
    $("dots").innerHTML = Array.from({ length: n + 1 }, (_, k) => `<i class="${k < cur.step ? "done" : k === cur.step ? "on" : ""}"></i>`).join("");
    $("prev").disabled = cur.step === 0;
    card.className = "panel card"; card.innerHTML = ""; card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    if (cur.step >= n) return renderDone(L, card);
    const s = L.steps[cur.step];
    $("next").textContent = "Next";
    if (s.type === "read") { card.innerHTML = s.html; setNext(true); }
    else if (s.type === "quiz") renderQuiz(s, card);
    else if (s.type === "interactive") INTERACTIVES[s.kind](card);
  }

  function renderQuiz(s, card) {
    const key = cur.step;
    card.innerHTML = `<h3>Check your thinking</h3><p class="big"></p><div class="choices2"></div><div class="fb"></div>`;
    card.querySelector(".big").textContent = s.q;
    const box = card.querySelector(".choices2"), fb = card.querySelector(".fb");
    const show = (picked) => {
      const right = picked === s.answer;
      [...box.children].forEach((b, i) => { b.disabled = right; b.classList.toggle("right", right && i === s.answer); b.classList.toggle("wrong", i === picked && !right); });
      fb.innerHTML = `<div class="feedback ${right ? "good" : "bad"}"><b>${right ? "Yes!" : "Not quite. Try again."}</b> ${right ? esc(s.explain) : ""}</div>`;
      setNext(right);
    };
    s.options.forEach((o, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "qopt"; b.textContent = o;
      b.onclick = () => {
        if (!(key in cur.answered)) { cur.answered[key] = i; if (i === s.answer) cur.score++; }
        E.Sound.play(i === s.answer ? "win" : "miss"); show(i);
      };
      box.appendChild(b);
    });
    if (cur.ok[key]) show(s.answer); else setNext(false);
    // remember a right answer so Back/Next keeps it
    box.addEventListener("click", () => { if ([...box.children].some((b) => b.classList.contains("right"))) cur.ok[key] = true; });
  }

  function renderDone(L, card) {
    const pct = cur.total ? cur.score / cur.total : 1;
    progress[L.id] = { done: true, score: cur.score, total: cur.total };
    ls.set("learn-progress", progress);
    card.className = "panel card done-card";
    card.innerHTML = `<div class="medal">✓</div><p class="big">Lesson complete!</p>
      <p>You got <b>${cur.score} of ${cur.total}</b> questions right on the first try.${pct === 1 ? " Perfect!" : ""}</p>
      <a class="btn big" href="${L.next.href}"></a>`;
    card.querySelector("a").textContent = L.next.label;
    $("next").textContent = cur.i < LESSONS.length - 1 ? "Next lesson" : "All lessons";
    setNext(true);
    E.Sound.play("fanfare");
  }

  // update a feedback box in place so it doesn't re-animate on every slider move
  function setFb(card, good, html) {
    const host = card.querySelector(".fb");
    let el = host.firstElementChild;
    if (!el) { el = document.createElement("div"); host.appendChild(el); }
    el.className = "feedback " + (good ? "good" : "bad"); el.innerHTML = html;
  }

  // ---------------- interactives ----------------
  const INTERACTIVES = {
    robotornot(card) {
      const items = [
        ["Blender", false, "Not a robot. It has no sensors and makes no decisions. You press the button."],
        ["Robot vacuum", true, "Robot! It senses walls and stairs, decides where to go, and drives itself."],
        ["Microwave", false, "Not a robot. It runs a timer you set. It doesn't check the food or decide anything."],
        ["Self-driving car", true, "Robot! Cameras sense the road, a computer decides, and it steers and brakes."],
        ["Toaster", false, "Not a robot. A timer pops the toast. Nothing senses or decides."],
        ["Robot arm with a camera", true, "Robot! The camera sees a block, the Raspberry Pi decides, and the servos move. Just like our arm!"],
      ];
      let answered = 0;
      card.innerHTML = `<h3>Robot or not?</h3><p>For each machine, decide: does it Sense, Think, AND Act on its own?</p><div class="ron"></div>`;
      const grid = card.querySelector(".ron");
      items.forEach(([name, isRobot, why]) => {
        const d = document.createElement("div"); d.className = "ritem";
        d.innerHTML = `<b></b><div class="btns"><button type="button">Robot</button><button type="button">Not a robot</button></div><small hidden></small>`;
        d.querySelector("b").textContent = name;
        const [yes, no] = d.querySelectorAll("button"), sm = d.querySelector("small");
        const pick = (guess) => {
          const right = guess === isRobot;
          if (!d.dataset.done) { d.dataset.done = 1; answered++; }
          d.className = "ritem " + (right ? "right" : "wrong");
          sm.hidden = false; sm.textContent = (right ? "Correct. " : "Not quite. ") + why;
          E.Sound.play(right ? "click" : "miss");
          setNext(answered === items.length);
        };
        yes.onclick = () => pick(true); no.onclick = () => pick(false);
        grid.appendChild(d);
      });
      setNext(false);
    },

    match(card) {
      const rows = [["See a red block on the table", "Camera"], ["Know how far away a wall is", "Ultrasonic"], ["Feel when it bumps into something", "Touch"], ["Know if it's tipping over", "Gyro"]];
      const opts = ["Camera", "Ultrasonic", "Touch", "Gyro"];
      card.innerHTML = `<h3>Match the job to the sensor</h3><p>Pick the best sensor for each job.</p><div class="match"></div><div class="fb"></div>`;
      const box = card.querySelector(".match"), fb = card.querySelector(".fb");
      const check = () => {
        let right = 0, all = true;
        [...box.children].forEach((r, i) => {
          const v = r.querySelector("select").value; if (!v) { all = false; r.className = "mrow"; return; }
          const ok = v === rows[i][1]; right += ok; r.className = "mrow " + (ok ? "right" : "wrong");
        });
        const done = all && right === rows.length;
        fb.innerHTML = all ? `<div class="feedback ${done ? "good" : "bad"}"><b>${done ? "All correct!" : `${right} of ${rows.length} right.`}</b> ${done ? "A gyro is how the flying car's computer knows it's tilting." : "Fix the red ones."}</div>` : "";
        setNext(done);
      };
      rows.forEach(([job]) => {
        const r = document.createElement("div"); r.className = "mrow";
        r.innerHTML = `<span></span><select aria-label="Sensor"><option value="">Pick...</option>${opts.map((o) => `<option>${o}</option>`).join("")}</select>`;
        r.querySelector("span").textContent = job;
        r.querySelector("select").onchange = () => { E.Sound.play("click"); check(); };
        box.appendChild(r);
      });
      setNext(false);
    },

    budget(card) {
      const bot = { name: "MINE", body: 1, sensor: 0, brain: 2, tool: 1, color: 0 };
      let touched = false;
      card.innerHTML = `<h3>Fit a robot under 75 kg</h3><p>This robot is too heavy. Swap parts until it fits.</p>
        <div class="mini"><canvas aria-label="Your robot"></canvas><div>
        <div class="lbl">Body</div><div class="chips" data-slot="body"></div>
        <div class="lbl">Sensor</div><div class="chips" data-slot="sensor"></div>
        <div class="lbl">Tool</div><div class="chips" data-slot="tool"></div>
        <div style="margin-top:12px" class="readout"><b class="wt"></b>of 75 kg</div>
        <div class="meter" style="margin-top:6px"><i></i></div></div></div><div class="fb"></div>`;
      const cv = card.querySelector("canvas");
      const draw = () => {
        const { ctx, w, h } = E.fit(cv);
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#2b2a30"; ctx.fillRect(0, h * 0.85, w, h * 0.15);
        E.drawBot(ctx, bot, w / 2 - 10, h * 0.85, Math.min(w / 4.4, h / 3.3), 1, performance.now() / 1000, {});
      };
      const update = () => {
        ["body", "sensor", "tool"].forEach((slot) => {
          const el = card.querySelector(`[data-slot="${slot}"]`); el.innerHTML = "";
          E.PARTS[slot].forEach((p, i) => {
            const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", bot[slot] === i);
            b.innerHTML = `${esc(p.n)}<em>${p.wt} kg</em>`;
            b.onclick = () => { bot[slot] = i; touched = true; E.Sound.play("click"); update(); };
            el.appendChild(b);
          });
        });
        const wt = E.statsOf(bot).wt, over = wt > E.MAXW;
        card.querySelector(".wt").textContent = wt + " kg";
        const m = card.querySelector(".meter"); m.classList.toggle("over", over); m.firstElementChild.style.width = Math.min(100, (wt / 75) * 100) + "%";
        setFb(card, !over, `<b>${over ? "Too heavy!" : "It fits!"}</b> ${over ? "The motors can't move it. Swap a heavy part for a lighter one." : `You gave up some strength to stay under the limit. That's a trade-off. ${75 - wt} kg left over.`}`);
        setNext(!over && touched);
        draw();
      };
      update();
      let raf; const loop = () => { if (!cv.isConnected) return cancelAnimationFrame(raf); draw(); raf = requestAnimationFrame(loop); }; loop();
    },

    thrust(card) {
      const st = { material: 2, lift: 6 };
      card.innerHTML = `<h3>Can your car lift itself?</h3><p>Pick a body and add lift nozzles. Get thrust-to-weight above 1.0.</p>
        <div class="mini"><canvas aria-label="Forces on the car"></canvas><div>
        <div class="lbl">Body material</div><div class="chips" id="t-mat"></div>
        <div class="slider" style="margin-top:12px"><div class="row"><span>Lift nozzles (1.6 kN each)</span><b id="t-n"></b></div><input type="range" id="t-lift" min="0" max="16" step="1" aria-label="Lift nozzles"></div>
        <div class="readout" style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><b id="t-tw"></b>thrust ÷ weight</div><div><b id="t-kg"></b>mass</div></div></div></div><div class="fb"></div>`;
      const cv = card.querySelector("canvas");
      let reached = false;
      const calc = () => {
        const S = F.sheet({ ...F.DEFAULT_DESIGN, material: st.material, lift: st.lift });
        return S;
      };
      const draw = (S) => {
        const { ctx, w, h } = E.fit(cv);
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h * 0.5, L = w * 0.42, H = L * 0.28;
        ctx.fillStyle = "#f46524"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
        E.rr(ctx, cx - L / 2, cy - H / 2, L, H, H * 0.4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#141316"; [-0.3, 0.3].forEach((k) => { ctx.beginPath(); ctx.arc(cx + L * k, cy + H / 2, H * 0.28, 0, 7); ctx.fill(); });
        for (let i = 0; i < st.lift; i++) {
          const x = cx - L * 0.4 + (i * L * 0.8) / Math.max(1, st.lift - 1);
          const g = ctx.createLinearGradient(0, cy + H / 2, 0, cy + H / 2 + H * 1.4); g.addColorStop(0, "rgba(191,230,255,.9)"); g.addColorStop(1, "rgba(56,167,240,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 3, cy + H / 2); ctx.lineTo(x + 3, cy + H / 2); ctx.lineTo(x + 7, cy + H / 2 + H * 1.4); ctx.lineTo(x - 7, cy + H / 2 + H * 1.4); ctx.fill();
        }
        const base = h * 0.28, wl = base, tl = base * (S.lift / S.weight);
        const arrow = (x, y1, y2, col, label, right) => {
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
          const d = y2 > y1 ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y2 + d * 6); ctx.lineTo(x - 9, y2 - d * 8); ctx.lineTo(x + 9, y2 - d * 8); ctx.fill();
          ctx.font = `700 ${Math.max(11, Math.round(w * 0.035))}px "JetBrains Mono", monospace`; if (right === "below") { ctx.textAlign = "right"; ctx.fillText(label, x + 10, y2 + 22); }
          else if (right === "above") { ctx.textAlign = "left"; ctx.fillText(label, x - 10, y2 - 14); }
          else { ctx.textAlign = right ? "left" : "right"; ctx.fillText(label, x + (right ? 12 : -12), y1 + (y2 - y1) * 0.6); }
        };
        arrow(cx + L * 0.56, cy, Math.min(cy + wl, h - 34), "#38a7f0", `WEIGHT ${F.kN(S.weight)}`, "below");
        if (st.lift) arrow(cx - L * 0.56, cy, Math.max(cy - tl, 34), "#ff8a50", `THRUST ${F.kN(S.lift)}`, "above");
      };
      const update = () => {
        const el = card.querySelector("#t-mat"); el.innerHTML = "";
        F.MATERIALS.forEach((m, i) => {
          const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", st.material === i);
          b.innerHTML = `${esc(m.n)}<em>${m.kg} kg</em>`; b.onclick = () => { st.material = i; E.Sound.play("click"); update(); };
          el.appendChild(b);
        });
        card.querySelector("#t-lift").value = st.lift; card.querySelector("#t-n").textContent = st.lift;
        const S = calc();
        card.querySelector("#t-tw").textContent = S.tw.toFixed(2); card.querySelector("#t-tw").style.color = S.tw >= 1 ? "var(--good)" : "var(--bad)";
        card.querySelector("#t-kg").textContent = F.kg(S.kg);
        if (S.tw >= 1) reached = true;
        setFb(card, S.tw >= 1, `<b>${S.tw >= 1 ? "Liftoff!" : "Not enough thrust."}</b> ${F.kN(S.lift)} ÷ ${F.kN(S.weight)} = ${S.tw.toFixed(2)}. ${S.tw >= 1 ? "Thrust beats weight, so the car can climb." : "Add nozzles or pick a lighter body."}`);
        setNext(reached);
        draw(S);
      };
      card.querySelector("#t-lift").addEventListener("input", (e) => { st.lift = +e.target.value; update(); });
      update();
    },

    falling(card) {
      let h = 5, moved = false;
      card.innerHTML = `<h3>How hard will it land?</h3><p>Drag the height and watch the landing speed.</p>
        <div class="slider"><div class="row"><span>Peak height</span><b id="f-h"></b></div><input type="range" id="f-range" min="1" max="20" step="0.5" aria-label="Peak height in meters"></div>
        <div class="readout" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><b id="f-v"></b>landing speed</div><div><b id="f-k"></b>same speed in km/h</div></div>
        <div class="lbl">Can an aluminum car survive? (body adds 2 m/s)</div><div id="f-gear" style="display:grid;gap:6px"></div><div class="fb"></div>`;
      const gears = F.GEARS.map((g) => ({ n: g.n, max: g.absorb + F.MATERIALS[1].str }));
      const update = () => {
        const v = Math.sqrt(2 * F.G * h);
        card.querySelector("#f-range").value = h; card.querySelector("#f-h").textContent = h + " m";
        card.querySelector("#f-v").textContent = v.toFixed(1) + " m/s"; card.querySelector("#f-k").textContent = Math.round(v * 3.6) + " km/h";
        card.querySelector("#f-gear").innerHTML = gears.map((g) => {
          const ok = v <= g.max, pct = Math.min(100, (v / g.max) * 100);
          return `<div class="verdict" style="display:grid;grid-template-columns:7em 1fr auto;gap:10px;align-items:center"><b>${g.n} gear</b><div class="meter${ok ? "" : " over"}"><i style="width:${pct}%"></i></div><span style="color:${ok ? "var(--good)" : "var(--bad)"};font-weight:700">${ok ? "survives" : "crashes"}</span></div>`;
        }).join("");
        if (moved) setFb(card, true, `<b>Notice:</b> from 5 m you hit at ${Math.sqrt(2 * F.G * 5).toFixed(1)} m/s, but from 20 m at ${Math.sqrt(2 * F.G * 20).toFixed(1)} m/s. Four times higher, twice as fast.`);
        setNext(moved);
      };
      card.querySelector("#f-range").addEventListener("input", (e) => { h = +e.target.value; moved = true; update(); });
      update();
    },
  };

  // ---------------- boot ----------------
  renderList();
  const m = (location.hash || "").match(/^#lesson-(\d+)$/);
  if (m && LESSONS[+m[1] - 1]) openLesson(+m[1] - 1);
  window.__learn = { LESSONS };
})();
