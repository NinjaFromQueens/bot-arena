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
      id: "ultrasonic", n: "Ultrasonic: seeing with sound", about: "How a robot measures distance with echoes, and what can fool it.",
      steps: [
        { type: "read", html: `<p class="big">An ultrasonic sensor finds things the way a bat does: it chirps, then listens for the echo.</p>
          <svg class="part" viewBox="0 0 360 170" role="img" aria-label="An ultrasonic sensor: a small blue board with two round silver cans. The left one is a speaker, the right one is a microphone.">
            <rect x="30" y="52" width="300" height="88" rx="10" fill="#2468b3" stroke="#141316" stroke-width="3"/>
            <g stroke="#141316" stroke-width="3" fill="#cfd2d8"><circle cx="110" cy="96" r="34"/><circle cx="250" cy="96" r="34"/></g>
            <g fill="#6f727a"><circle cx="110" cy="96" r="23"/><circle cx="250" cy="96" r="23"/></g>
            <g fill="#141316"><rect x="159" y="140" width="6" height="20"/><rect x="171" y="140" width="6" height="20"/><rect x="183" y="140" width="6" height="20"/><rect x="195" y="140" width="6" height="20"/></g>
            <g font-family="JetBrains Mono, monospace" text-anchor="middle"><text x="110" y="22" fill="#f4f1ea" font-size="15" font-weight="700">SPEAKER</text><text x="110" y="40" fill="#aaa6b0" font-size="12">sends the chirp</text>
            <text x="250" y="22" fill="#f4f1ea" font-size="15" font-weight="700">MICROPHONE</text><text x="250" y="40" fill="#aaa6b0" font-size="12">hears the echo</text></g>
          </svg>
          <p>The chirp vibrates <b>40,000 times per second</b>. People can only hear up to about 20,000, so it's too high for us. That's why it's called <b>ultra</b>sonic: beyond sound.</p>` },
        { type: "read", html: `<h3>Time the echo</h3>
          <p>The sensor starts a timer when it chirps and stops it when the echo comes back. Sound travels about <b>343 meters per second</b>, and it goes there <i>and</i> back, so:</p>
          <p class="formula">distance = 343 × time ÷ 2</p>
          <p>The times are tiny, so we use <b>milliseconds (ms)</b>, thousandths of a second. An echo after 10 ms means 343 × 0.010 ÷ 2 ≈ <b>1.7 m</b>.</p>
          <p>The chirp spreads out in a <b>cone</b>, like a flashlight beam. The sensor reports the closest thing inside the cone.</p>` },
        { type: "interactive", kind: "sonar" },
        { type: "read", html: `<h3>Why some things fool it</h3>
          <ul><li><b>Soft things</b> like pillows, couches, and curtains soak up sound instead of bouncing it back.</li>
          <li><b>Tilted walls</b> can bounce the sound off to the side, like a ball hitting a wall at an angle. Then the echo never reaches the microphone.</li>
          <li><b>Far things:</b> sound gets weaker as it spreads out. A typical classroom sensor can't hear echoes from more than about <b>4 m</b> away.</li></ul>
          <p>Every time, the robot hears nothing and thinks the path is clear. That's how robots crash!</p>` },
        { type: "quiz", q: "The echo comes back after 6 ms (0.006 seconds). About how far away is the wall?", options: ["0.5 m", "1.0 m", "2.1 m", "3.4 m"], answer: 1, explain: "343 × 0.006 = 2.06 m there and back. Divide by 2: about 1.0 m." },
        { type: "quiz", q: "Why did the tilted wall fool the sensor?", options: ["Tilted walls are always too far away", "The echo bounced off to the side and never came back", "The wall soaked up the sound", "Sound can't hit walls"], answer: 1, explain: "Sound bounces like a ball. Off a tilted wall it goes sideways, so the microphone never hears it." },
        { type: "quiz", q: "In Bot Arena, what does the Ultrasonic sensor help your robot do best?", options: ["Aim perfectly", "Dodge attacks", "Carry more weight"], answer: 1, explain: "It measures distance, so your robot dodges better. Its aim is okay, but the Camera aims best." },
      ],
      next: { label: "Give your robot an Ultrasonic sensor", href: "/practice" },
    },
    {
      id: "lidar", n: "Lidar: seeing with light", about: "How a spinning laser maps a room, like a robot vacuum or a self-driving car.",
      steps: [
        { type: "read", html: `<p class="big">Lidar works like ultrasonic, but it uses a laser instead of sound.</p>
          <p><b>LIDAR</b> stands for <b>LI</b>ght <b>D</b>etection <b>A</b>nd <b>R</b>anging. Most lidars fire a tiny flash of invisible laser light and time how long the reflection takes to come back.</p>
          <p>Light is about <b>870,000 times faster</b> than sound. It travels about <b>30 cm in one nanosecond (ns)</b>, a billionth of a second. So lidar needs a super fast timer.</p>
          <p class="formula">distance = speed of light × time ÷ 2</p>` },
        { type: "read", html: `<h3>Spin it to make a map</h3>
          <p>A laser beam is thin, so it measures one exact spot. To see the whole room, many lidars <b>spin</b> and measure thousands of spots every second.</p>
          <p>Each measurement is one dot. Put the dots together and you get a map called a <b>point cloud</b>.</p>
          <ul><li><b>Robot vacuums:</b> on many of them, the round bump on top is a spinning lidar that maps your house.</li>
          <li><b>Self-driving cars:</b> many use lidar to spot cars, bikes, and people all around them.</li>
          <li><b>Some phones</b> have a tiny lidar that measures rooms and helps the camera focus in the dark.</li></ul>` },
        { type: "interactive", kind: "lidar" },
        { type: "read", html: `<h3>What lidar can't see</h3>
          <ul><li><b>Behind things.</b> The laser stops at the first thing it hits. That's why you had to drive around the mystery shape.</li>
          <li><b>Clear glass.</b> The laser goes right through, so a glass door can look like an open doorway.</li>
          <li><b>Mirrors</b> bounce the laser away, and <b>fog or heavy rain</b> scatters it.</li></ul>` },
        { type: "quiz", q: "Light travels about 30 cm every nanosecond. A laser flash comes back after 20 nanoseconds. How far away is the object?", options: ["0.3 m", "3 m", "6 m", "20 m"], answer: 1, explain: "In 20 ns light goes 20 × 0.3 m = 6 m. That's there and back, so the object is 3 m away." },
        { type: "quiz", q: "Why does a robot vacuum's lidar spin?", options: ["To keep the laser cool", "To measure in every direction and build a map", "To suck up more dust", "To make a humming sound"], answer: 1, explain: "One laser beam measures one spot. Spinning sweeps it all the way around, thousands of times, to map the room." },
        { type: "quiz", q: "In the mystery room, why did you have to drive around the shape?", options: ["The laser was too weak", "Lidar only sees the sides its laser can reach", "The shape kept moving"], answer: 1, explain: "The laser can't go through things, so the back of the shape stays hidden until you look from another side." },
      ],
      next: { label: "Build a robot in practice mode", href: "/practice" },
    },
    {
      id: "showdown", n: "Sensor showdown", about: "Ultrasonic vs. lidar vs. infrared: find each sensor's blind spot.",
      steps: [
        { type: "read", html: `<p class="big">Every sensor has a blind spot. Engineers pick the right one for the job.</p>
          <table class="rtab"><thead><tr><th>Sensor</th><th>Range</th><th>Gets fooled by</th></tr></thead><tbody>
          <tr><td><b>Ultrasonic</b><small>sound</small></td><td>up to about 4 m, wide cone</td><td>soft things, tilted walls</td></tr>
          <tr><td><b>Lidar</b><small>laser light</small></td><td>12 m or more, one exact spot</td><td>clear glass, mirrors</td></tr>
          <tr><td><b>Infrared</b><small>invisible light</small></td><td>short: often under 1 m</td><td>black things, clear glass, bright sunlight</td></tr>
          <tr><td><b>Camera</b><small>pictures</small></td><td>as far as it can see</td><td>darkness. One camera can't easily tell how far away things are.</td></tr>
          <tr><td><b>Touch</b><small>a button</small></td><td>none: only when it bumps</td><td>nothing, but it only knows after it hits</td></tr>
          </tbody></table>
          <p class="small">Ranges are for common, low-cost sensors like the ones in school robot kits.</p>
          <p><b>Infrared</b> sensors shine invisible light (the same kind a TV remote uses) and measure the light that bounces back.</p>` },
        { type: "interactive", kind: "showdown" },
        { type: "read", html: `<h3>Sensor fusion: use a team</h3>
          <p>Real robots use <b>more than one kind of sensor</b>, so when one gets fooled, another catches it. That's called <b>sensor fusion</b>.</p>
          <ul><li><b>Robot vacuums:</b> lidar to map, bump sensors for anything it missed, and infrared cliff sensors underneath so it doesn't fall down the stairs.</li>
          <li><b>Self-driving cars:</b> cameras to read signs and traffic lights, radar to see through rain, and lidar to measure exact shapes.</li></ul>
          <p>In Bot Arena your robot gets one sensor, so pick the one that fits your plan!</p>` },
        { type: "quiz", q: "A robot vacuum keeps bumping into a glass door. Its lidar says the way is clear. Which sensor would notice the door?", options: ["A stronger laser", "Ultrasonic, because sound bounces off glass", "Infrared", "A camera"], answer: 1, explain: "Light goes right through clear glass, but sound bounces off it. An ultrasonic sensor hears the door." },
        { type: "quiz", q: "Some robot vacuums won't drive onto a black rug. Why?", options: ["Black rugs are too heavy", "Their infrared cliff sensors get almost no light back, so the rug looks like a drop-off", "The rug soaks up the lidar", "The rug is too far away"], answer: 1, explain: "Cliff sensors shine infrared light at the floor. Black soaks it up, so the vacuum thinks it's at the top of the stairs." },
        { type: "quiz", q: "What is sensor fusion?", options: ["Melting two sensors together", "Using different sensors together so one catches what another misses", "Using the most expensive sensor", "Turning sensors off to save power"], answer: 1, explain: "No sensor is perfect. A team of different sensors covers each other's blind spots." },
      ],
      next: { label: "Pick the best sensor for your robot", href: "/practice" },
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
  // redraw every frame while the canvas is on screen; stops once the card moves on
  function animate(cv, frame) {
    const loop = (now) => { if (!cv.isConnected) return; if (cv.offsetParent) frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------------- interactives ----------------
  const INTERACTIVES = {
    robotornot(card) {
      const items = [
        ["Blender", false, "Not a robot. It has no sensors and makes no decisions. You press the button."],
        ["Robot vacuum", true, "Robot! It senses walls and stairs, decides where to go, and drives itself."],
        ["Microwave", false, "Not a robot. A basic microwave just counts down the time you set. It doesn't check the food or decide anything."],
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
        <div class="lbl">Can an aluminum car survive? (Its body takes 2 m/s on top of the landing gear.)</div><div id="f-gear" style="display:grid;gap:6px"></div><div class="fb"></div>`;
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

    sonar(card) {
      const SN = window.Sensors, key = cur.step, V = 3; // V: on-screen speed of sound in m/s, super slow motion
      const span = (SN.SENSORS.ultrasonic.cone * Math.PI) / 180, MAX = SN.SENSORS.ultrasonic.range;
      const TARGETS = [["Hard wall", "wall", 0, "A flat, hard wall facing the sensor."], ["Pillow", "soft", 0, "Soft and fluffy, like a couch cushion."], ["Tilted wall", "wall", 45, "A hard wall turned 45° away from the sensor."]];
      const TASKS = [["ok", "Get an echo from the hard wall"], ["absorb", "Ping the pillow"], ["tilt", "Ping the tilted wall"], ["far", "Find a wall too far away to hear"]];
      const st = { t: 0, d: 2, ping: null, done: {} };
      card.innerHTML = `<h3>Ultrasonic simulator</h3><p>Pick a target, set the distance, and press <b>Ping</b>. The sound moves in super slow motion so you can watch it. Predict first: will the pillow send back an echo?</p>
        <div class="sim"><canvas aria-label="Top view: a robot's ultrasonic sensor pings a target"></canvas></div>
        <div class="simrow"><div class="chips" id="u-t"></div><button class="btn" id="u-ping" type="button" data-tip="Send one chirp and time how long the echo takes.">Ping!</button></div>
        <div class="slider" data-tip="Move the target closer or farther. The sensor's max range is about 4 m."><div class="row"><span>Distance to target</span><b id="u-d"></b></div><input type="range" id="u-range" min="0.5" max="5" step="0.1" aria-label="Distance to target in meters"></div>
        <div class="readout simout"><div tabindex="0" data-tip="Time since the chirp, in milliseconds (thousandths of a second)."><b id="u-time">0.0 ms</b>echo timer</div><div tabindex="0" data-tip="What the robot decides from the echo, right or wrong."><b id="u-says">?</b>robot thinks</div></div>
        <div class="lbl">Experiments</div><ul class="tasks" id="u-tasks"></ul><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const tasks = () => { q("#u-tasks").innerHTML = TASKS.map(([k, t]) => `<li${st.done[k] ? ' class="done"' : ""}>${t}</li>`).join(""); };
      const reset = () => { st.ping = null; q("#u-time").textContent = "0.0 ms"; q("#u-says").textContent = "?"; q("#u-says").style.color = ""; };
      const chips = () => {
        const el = q("#u-t"); el.innerHTML = "";
        TARGETS.forEach(([n, , , tip], i) => {
          const b = document.createElement("button"); b.type = "button"; b.textContent = n; b.setAttribute("aria-pressed", st.t === i); b.setAttribute("data-tip", tip);
          b.onclick = () => { st.t = i; E.Sound.play("click"); reset(); chips(); };
          el.appendChild(b);
        });
      };
      q("#u-range").value = st.d; q("#u-d").textContent = st.d.toFixed(1) + " m";
      q("#u-range").addEventListener("input", (e) => { st.d = +e.target.value; q("#u-d").textContent = st.d.toFixed(1) + " m"; reset(); });
      q("#u-ping").onclick = () => {
        const [, surface, tilt] = TARGETS[st.t], res = SN.read("ultrasonic", surface, st.d, tilt);
        // no echo: the sensor waits a little past when one would have arrived, then gives up
        st.ping = { t0: performance.now(), res, end: res.ok ? 2 * st.d : 2 * Math.min(st.d, MAX) + 0.6, fin: false };
        q("#u-says").textContent = "listening..."; q("#u-says").style.color = ""; E.Sound.play("scan");
      };
      const finish = (p) => {
        p.fin = true;
        q("#u-time").textContent = SN.fmtTime(p.end / SN.SOUND);
        q("#u-says").textContent = p.res.ok ? `wall at ${p.res.dist.toFixed(2)} m` : "path is clear!";
        q("#u-says").style.color = p.res.ok ? "var(--good)" : "var(--bad)";
        st.done[p.res.reason] = true; tasks();
        const all = TASKS.every(([k]) => st.done[k]);
        if (all) { cur.ok[key] = true; setNext(true); }
        setFb(card, p.res.ok || all, `<b>${p.res.ok ? "Echo!" : "No echo."}</b> ${p.res.why}${all ? "<br><b>All 4 experiments done!</b> Now you know what fools an ultrasonic sensor." : ""}`);
        E.Sound.play(p.res.ok ? "beep" : "miss");
      };
      const draw = (now) => {
        const { ctx, w, h } = E.fit(cv), s = w / 5.9, X = (x) => (x + 0.35) * s, cy = h * 0.45, p = st.ping, [, surface, tilt] = TARGETS[st.t], tx = X(st.d);
        const fs = Math.max(10, Math.round(s * 0.14)), ry = h - fs - 8;
        ctx.clearRect(0, 0, w, h);
        ctx.font = `700 ${fs}px "JetBrains Mono", monospace`; ctx.textAlign = "center";
        ctx.fillStyle = "rgba(56,167,240,.07)"; ctx.beginPath(); ctx.moveTo(X(0), cy); ctx.arc(X(0), cy, 7 * s, -span, span); ctx.closePath(); ctx.fill();
        // target
        ctx.lineWidth = 2; ctx.strokeStyle = "#141316";
        if (surface === "soft") {
          ctx.fillStyle = "#b98be0"; E.rr(ctx, tx, cy - 0.5 * s, 0.35 * s, s, 0.14 * s); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "rgba(20,19,22,.35)"; [-0.17, 0.17].forEach((k) => { ctx.beginPath(); ctx.moveTo(tx + 0.06 * s, cy + k * s); ctx.lineTo(tx + 0.29 * s, cy + k * s); ctx.stroke(); });
        } else {
          ctx.save(); ctx.translate(tx, cy); if (tilt) ctx.rotate((tilt * Math.PI) / 180);
          ctx.fillStyle = "#8a8792"; ctx.fillRect(0, -1.6 * s, 0.12 * s, 3.2 * s); ctx.strokeRect(0, -1.6 * s, 0.12 * s, 3.2 * s); ctx.restore();
        }
        // ruler on top of the target so its labels stay readable
        ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.fillStyle = "#aaa6b0"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(0), ry); ctx.lineTo(X(5.4), ry); ctx.stroke();
        for (let m = 0; m <= 5; m++) { ctx.beginPath(); ctx.moveTo(X(m), ry - 5); ctx.lineTo(X(m), ry + 5); ctx.stroke(); ctx.fillText(m + " m", X(m), h - 4); }
        ctx.strokeStyle = "rgba(255,93,93,.5)"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(X(MAX), fs + 8); ctx.lineTo(X(MAX), ry - 8); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#ff8a8a"; ctx.fillText("max range", X(MAX), fs + 2);
        // robot with its sensor on the front
        ctx.fillStyle = "#f46524"; ctx.strokeStyle = "#141316"; E.rr(ctx, X(-0.32), cy - 0.24 * s, 0.32 * s, 0.48 * s, 0.08 * s); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2468b3"; ctx.fillRect(X(-0.02), cy - 0.16 * s, 0.05 * s, 0.32 * s);
        ctx.fillStyle = "#cfd2d8"; [-0.08, 0.08].forEach((k) => { ctx.beginPath(); ctx.arc(X(0.03), cy + k * s, 0.045 * s, 0, 7); ctx.fill(); });
        if (!p) return;
        const r = Math.min(p.end, (V * (now - p.t0)) / 1000), reason = p.res.reason;
        if (!p.fin) q("#u-time").textContent = SN.fmtTime(r / SN.SOUND);
        const ring = (x, a, rad, alpha) => { if (rad <= 0 || alpha <= 0) return; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, cy, rad * s, a - span, a + span); ctx.stroke(); ctx.globalAlpha = 1; };
        ctx.strokeStyle = "#38a7f0"; ctx.lineWidth = 3;
        [0, 0.15, 0.3].forEach((lag, k) => {
          const rk = r - lag, fade = [1, 0.55, 0.25][k], back = rk - st.d;
          if (reason === "far") { if (rk < Math.min(st.d, MAX + 0.6)) ring(X(0), 0, rk, fade * (1 - rk / (MAX + 0.6))); return; } // fades out as it spreads
          if (reason === "absorb") { if (rk < st.d + 0.35) ring(X(0), 0, rk, back < 0 ? fade : fade * (1 - back / 0.35)); return; } // dies inside the pillow
          if (back < 0) ring(X(0), 0, rk, fade);
          else if (reason === "ok" && back < st.d) ring(tx, Math.PI, back, fade); // echo heads home
          else if (reason === "tilt" && back < 2) ring(tx, -Math.PI / 2, back, fade); // bounces away sideways
        });
        if (!p.fin && r >= p.end) finish(p);
        if (p.fin) {
          ctx.font = `700 ${Math.round(fs * 1.5)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "left";
          ctx.fillStyle = p.res.ok ? "#4fd18b" : "#ff5d5d"; ctx.fillText(p.res.ok ? "ECHO!" : "NO ECHO", X(-0.3), cy - 0.4 * s);
        }
      };
      chips(); tasks(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },

    lidar(card) {
      const SN = window.Sensors, key = cur.step, W = 10, H = 6, R = 0.3, CX = 6.3, CY = 3, RAYS = 240, SPIN = 1.5;
      const MYST = {
        Square: [[-0.65, -0.65], [0.65, -0.65], [0.65, 0.65], [-0.65, 0.65]],
        Triangle: [[-0.6, -0.75], [0.75, 0], [-0.6, 0.75]],
        Diamond: [[-0.8, 0], [0, -0.8], [0.8, 0], [0, 0.8]],
        Circle: SN.circle(0, 0, 0.7).pts,
      };
      const names = Object.keys(MYST), answer = names[Math.floor(Math.random() * names.length)];
      // a triangle can point either way, so from the front it can look like the square or the diamond
      const flip = answer === "Triangle" && Math.random() < 0.5 ? -1 : 1;
      const myst = { pts: MYST[answer].map(([x, y]) => [CX + x * flip, CY + y]), surface: "wall" };
      const furniture = [{ ...SN.box(0.5, 0.4, 2.7, 1.2, "soft"), n: "couch" }, { ...SN.box(7.6, 4.9, 9.6, 5.6, "wall"), n: "shelf" }, { ...SN.box(3.4, 4.3, 4.3, 5.2, "wall"), n: "box" }];
      const solid = [...furniture, myst], segs = SN.segments([SN.box(0, 0, W, H, "wall"), ...solid]);
      const st = { x: 1.6, y: 3, a: 0, pts: [], hit: null, moved: 0, drag: false, solved: false, last: 0, shown: 0 };
      const view = { s: 1, ox: 0, oy: 0 };
      card.innerHTML = `<h3>Lidar mystery room</h3><p>The robot's spinning laser paints a blue dot everywhere it hits. Something is hiding in the middle of the room. <b>Drag the robot</b> (or tap where it should go) to look from different sides.</p>
        <div class="sim room"><canvas tabindex="0" aria-label="Top view of a room. Drag the robot, or use the arrow keys, to move it. Blue dots show what its lidar sees."></canvas></div>
        <div class="readout simout"><div tabindex="0" data-tip="How far the laser went before it hit something."><b id="l-d">-</b>laser distance</div><div tabindex="0" data-tip="Time for the laser to go out and come back, in nanoseconds (billionths of a second)."><b id="l-t">-</b>light's round trip</div></div>
        <div class="lbl">What's hiding in the middle of the room?</div><div class="chips" id="l-q"></div><p class="hint" id="l-hint"></p><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const free = (x, y) => x > R && x < W - R && y > R && y < H - R && solid.every((sh) => !SN.inside(sh.pts, x, y)) && segs.every((sg) => SN.segDist(sg, x, y) >= R);
      const ready = () => st.moved >= 2.5;
      const choices = () => {
        const el = q("#l-q"); el.innerHTML = "";
        names.forEach((n) => {
          const b = document.createElement("button"); b.type = "button"; b.textContent = n; b.disabled = st.solved || !ready();
          if (st.solved && n === answer) b.className = "right";
          b.onclick = () => {
            if (n === answer) {
              st.solved = true; cur.ok[key] = true; setNext(true); E.Sound.play("win"); choices();
              setFb(card, true, `<b>Yes, it's a ${answer.toLowerCase()}!</b> From one spot you only see the side facing you. Lidar only sees what its laser can reach, so you had to look from more than one side.`);
            } else { b.className = "wrong"; E.Sound.play("miss"); setFb(card, false, `<b>Not quite.</b> Drive to the other side of the shape and look at the dots again.`); }
          };
          el.appendChild(b);
        });
        q("#l-hint").textContent = st.solved ? "" : ready() ? "Make your guess. Not sure? Keep exploring." : "Explore first: move the robot around the room.";
      };
      const moveTo = (x, y) => {
        if (!free(x, y)) return;
        const wasReady = ready(); st.moved += Math.hypot(x - st.x, y - st.y); st.x = x; st.y = y;
        if (ready() !== wasReady) choices();
      };
      const toWorld = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s]; };
      cv.addEventListener("pointerdown", (e) => { st.drag = true; try { cv.setPointerCapture(e.pointerId); } catch {} moveTo(...toWorld(e)); });
      cv.addEventListener("pointermove", (e) => { if (st.drag) moveTo(...toWorld(e)); });
      ["pointerup", "pointercancel"].forEach((t) => cv.addEventListener(t, () => (st.drag = false)));
      cv.addEventListener("keydown", (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (d) { e.preventDefault(); moveTo(st.x + d[0] * 0.25, st.y + d[1] * 0.25); }
      });
      const draw = (now) => {
        const dt = Math.min(0.05, (now - (st.last || now)) / 1000); st.last = now;
        for (let i = Math.round(dt * SPIN * RAYS); i > 0; i--) {
          st.a = (st.a + (2 * Math.PI) / RAYS) % (2 * Math.PI);
          st.hit = SN.cast(segs, st.x, st.y, st.a, "lidar");
          if (st.hit) st.pts.push([st.hit.x, st.hit.y]);
        }
        if (st.pts.length > 6000) st.pts.splice(0, st.pts.length - 6000);
        const { ctx, w, h } = E.fit(cv), s = Math.min(w / (W + 0.4), h / (H + 0.4)), ox = (w - W * s) / 2, oy = (h - H * s) / 2;
        Object.assign(view, { s, ox, oy });
        const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](ox + x * s, oy + y * s)); ctx.closePath(); };
        ctx.clearRect(0, 0, w, h);
        // the real room, faint: the robot itself only knows the dots
        ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.strokeRect(ox, oy, W * s, H * s);
        ctx.font = `600 ${Math.max(10, Math.round(s * 0.24))}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,.3)";
        furniture.forEach((f) => { path(f.pts); ctx.stroke(); const [x1, y1] = f.pts[0], [x2, y2] = f.pts[2]; ctx.fillText(f.n, ox + ((x1 + x2) / 2) * s, oy + ((y1 + y2) / 2) * s); });
        ctx.setLineDash([]);
        if (st.solved) { path(myst.pts); ctx.strokeStyle = "#ff8a50"; ctx.lineWidth = 3; ctx.stroke(); }
        else { ctx.font = `700 ${Math.round(s * 0.9)}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillText("?", ox + CX * s, oy + CY * s); }
        ctx.fillStyle = "#38a7f0"; const ds = Math.max(2, s * 0.035);
        for (const [x, y] of st.pts) ctx.fillRect(ox + x * s - ds / 2, oy + y * s - ds / 2, ds, ds);
        const rx = ox + st.x * s, ry = oy + st.y * s;
        if (st.hit) {
          ctx.strokeStyle = "rgba(255,93,93,.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(ox + st.hit.x * s, oy + st.hit.y * s); ctx.stroke();
          ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.arc(ox + st.hit.x * s, oy + st.hit.y * s, 4, 0, 7); ctx.fill();
        }
        ctx.fillStyle = "#f46524"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, R * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(rx, ry, R * 0.45 * s, 0, 7); ctx.fill();
        ctx.strokeStyle = "#ff5d5d"; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(st.a) * R * 0.45 * s, ry + Math.sin(st.a) * R * 0.45 * s); ctx.stroke();
        if (st.moved < 0.3) { ctx.font = `700 ${Math.max(11, Math.round(s * 0.26))}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "#ffd23f"; ctx.fillText("drag me", rx, ry - R * s - 12); }
        ctx.textBaseline = "alphabetic";
        if (st.hit && now - st.shown > 250) { st.shown = now; q("#l-d").textContent = st.hit.dist.toFixed(2) + " m"; q("#l-t").textContent = SN.fmtTime(st.hit.time); } // slow enough to read
      };
      choices(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },

    showdown(card) {
      const SN = window.Sensors, key = cur.step, V = 2.5, VIEW = 3.45; // on-screen signal speed (m/s) and how many meters fit across
      const SENS = ["ultrasonic", "lidar", "infrared"];
      const TGT = [["wall", 0.6, "Wall", "A plain wall 0.6 m away."], ["glass", 0.6, "Glass door", "A clear glass door 0.6 m away."], ["soft", 0.6, "Couch", "A soft, fluffy couch 0.6 m away."], ["black", 0.6, "Black box", "A black box 0.6 m away."], ["wall", 3, "Far wall", "A plain wall 3 m away."]];
      const SENS_TIP = { ultrasonic: "Uses sound. Wide cone, reaches about 4 m.", lidar: "Uses a laser. One exact spot, reaches about 12 m.", infrared: "Uses invisible light. Short range: about 0.8 m." };
      const COL = { ultrasonic: "#38a7f0", lidar: "#ff5d5d", infrared: "#c58cff" };
      const st = { s: 0, t: 0, run: null, tested: {} };
      card.innerHTML = `<h3>Sensor showdown</h3><p>Pick a sensor and a target to test it. Find one thing that <b>each</b> sensor can't see.</p>
        <div class="sim"><canvas aria-label="Top view: a robot tests its sensor on a target"></canvas></div>
        <div class="lbl">Sensor</div><div class="chips" id="s-s"></div>
        <div class="lbl">Target</div><div class="chips" id="s-t"></div>
        <table class="rtab grid" aria-label="Results" data-tip="✓ means the sensor saw the target. ✗ means it missed."><thead><tr><th></th>${TGT.map((t) => `<th>${t[2]}</th>`).join("")}</tr></thead><tbody>
        ${SENS.map((k, i) => `<tr><th>${SN.SENSORS[k].n}</th>${TGT.map((_, j) => `<td id="c${i}-${j}"></td>`).join("")}</tr>`).join("")}</tbody></table>
        <ul class="tasks" id="s-tasks"></ul><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const blind = (i) => TGT.some((_, j) => st.tested[i + "," + j] === false);
      const table = () => SENS.forEach((_, i) => TGT.forEach((_, j) => {
        const c = q(`#c${i}-${j}`), v = st.tested[i + "," + j];
        c.textContent = v === undefined ? "" : v ? "✓" : "✗"; c.className = (v === undefined ? "" : v ? "yes" : "no") + (i === st.s && j === st.t ? " cur" : "");
      }));
      const tasks = () => { q("#s-tasks").innerHTML = SENS.map((k, i) => `<li${blind(i) ? ' class="done"' : ""}>Find ${SN.SENSORS[k].n}'s blind spot</li>`).join(""); };
      const test = () => {
        const [surface, dist] = TGT[st.t], k = SENS[st.s], res = SN.read(k, surface, dist), range = SN.SENSORS[k].range;
        // how far the signal travels on screen: to the target and back, through the glass, or until it dies out
        const out = res.reason === "far" ? range : res.reason === "pass" ? VIEW : dist;
        st.run = { t0: performance.now(), res, k, out, dur: (res.ok ? 2 * dist : out + 0.3) / V, fin: false };
        table();
      };
      const chips = (id, list, prop, tips) => {
        const el = q(id); el.innerHTML = "";
        list.forEach((label, i) => {
          const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.setAttribute("aria-pressed", st[prop] === i); b.setAttribute("data-tip", tips[i]);
          b.onclick = () => { st[prop] = i; E.Sound.play("click"); chips(id, list, prop, tips); test(); };
          el.appendChild(b);
        });
      };
      const finish = (run) => {
        run.fin = true; st.tested[st.s + "," + st.t] = run.res.ok; table(); tasks();
        const found = SENS.filter((_, i) => blind(i)).length;
        if (found === SENS.length) { cur.ok[key] = true; setNext(true); }
        setFb(card, run.res.ok || found === SENS.length, `<b>${SN.SENSORS[run.k].n} ${run.res.ok ? "reads " + run.res.dist.toFixed(2) + " m" : "sees nothing!"}</b> ${run.res.why}<br>${found === SENS.length ? "<b>You found every sensor's blind spot!</b> No sensor is perfect." : `Blind spots found: ${found} of ${SENS.length}.`}`);
        E.Sound.play(run.res.ok ? "beep" : "miss");
      };
      const draw = (now) => {
        const { ctx, w, h } = E.fit(cv), s = w / (VIEW + 0.45), X = (x) => (x + 0.45) * s, cy = h * 0.55, run = st.run, [surface, dist, label] = TGT[st.t], k = SENS[st.s], tx = X(dist);
        const fs = Math.max(10, Math.round(s * 0.11));
        ctx.clearRect(0, 0, w, h);
        ctx.font = `700 ${fs}px "JetBrains Mono", monospace`; ctx.textAlign = "center";
        const range = SN.SENSORS[k].range;
        if (range < VIEW) {
          ctx.strokeStyle = "rgba(255,93,93,.5)"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(X(range), fs + 8); ctx.lineTo(X(range), h - 6); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "#ff8a8a"; ctx.fillText("max range", X(range), fs + 2);
        }
        // target
        ctx.lineWidth = 2; ctx.strokeStyle = "#141316";
        if (surface === "wall") { ctx.fillStyle = "#8a8792"; ctx.fillRect(tx, 0, 0.1 * s, h); ctx.strokeRect(tx, -2, 0.1 * s, h + 4); }
        if (surface === "glass") {
          ctx.fillStyle = "rgba(150,210,255,.22)"; ctx.strokeStyle = "rgba(190,230,255,.8)"; ctx.fillRect(tx, 0, 0.08 * s, h); ctx.strokeRect(tx, -2, 0.08 * s, h + 4);
          ctx.beginPath(); [0.3, 0.45].forEach((f) => { ctx.moveTo(tx + 0.01 * s, h * f); ctx.lineTo(tx + 0.07 * s, h * f - 0.12 * s); }); ctx.stroke();
        }
        if (surface === "soft") {
          ctx.fillStyle = "#9b6fd0"; E.rr(ctx, tx, cy - 0.6 * s, 0.5 * s, 1.2 * s, 0.12 * s); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "rgba(20,19,22,.35)"; [-0.2, 0.2].forEach((f) => { ctx.beginPath(); ctx.moveTo(tx + 0.08 * s, cy + f * s); ctx.lineTo(tx + 0.42 * s, cy + f * s); ctx.stroke(); });
        }
        if (surface === "black") { ctx.fillStyle = "#0c0c0e"; ctx.strokeStyle = "#55535c"; ctx.fillRect(tx, cy - 0.25 * s, 0.5 * s, 0.5 * s); ctx.strokeRect(tx, cy - 0.25 * s, 0.5 * s, 0.5 * s); }
        ctx.fillStyle = "#f4f1ea"; ctx.fillText(label, tx + 0.25 * s, surface === "wall" || surface === "glass" ? h - 8 : cy - 0.7 * s);
        // robot
        ctx.fillStyle = "#f46524"; ctx.strokeStyle = "#141316"; E.rr(ctx, X(-0.32), cy - 0.24 * s, 0.32 * s, 0.48 * s, 0.08 * s); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL[k]; ctx.beginPath(); ctx.arc(X(0), cy, 0.06 * s, 0, 7); ctx.fill();
        if (!run) return;
        const r = Math.min((V * (now - run.t0)) / 1000, run.dur * V), col = COL[run.k], back = r - run.out;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        if (run.k === "ultrasonic") {
          const span = (SN.SENSORS.ultrasonic.cone * Math.PI) / 180;
          const ring = (x, a, rad, al) => { if (rad <= 0 || al <= 0) return; ctx.globalAlpha = al; ctx.beginPath(); ctx.arc(x, cy, rad * s, a - span, a + span); ctx.stroke(); ctx.globalAlpha = 1; };
          if (back < 0) ring(X(0), 0, r, 1);
          else if (run.res.ok && back < run.out) ring(X(run.out), Math.PI, back, 1);
          else if (!run.res.ok) ring(X(0), 0, r, 1 - back / 0.3); // soaked up: fades into the couch
        } else {
          // light: a short flash travels out, then back (or through, or fades)
          if (run.k === "infrared") ctx.setLineDash([8, 5]);
          const flash = (a, b, al) => { if (al <= 0) return; ctx.globalAlpha = al; ctx.beginPath(); ctx.moveTo(X(Math.max(0, a)), cy); ctx.lineTo(X(Math.max(0, b)), cy); ctx.stroke(); ctx.globalAlpha = 1; };
          if (back < 0) flash(r - 0.25, r, 1);
          else if (run.res.ok && back < run.out) flash(run.out - back, run.out - back + 0.25, 1);
          else if (!run.res.ok) flash(run.out - 0.25, run.out, 1 - back / 0.3);
          ctx.setLineDash([]);
        }
        if (!run.fin && r >= run.dur * V) finish(run);
        if (run.fin) {
          ctx.font = `700 ${Math.round(fs * 1.6)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "left";
          ctx.fillStyle = run.res.ok ? "#4fd18b" : "#ff5d5d"; ctx.fillText(run.res.ok ? `${run.res.dist.toFixed(2)} m` : "NOTHING", X(-0.4), cy - 0.45 * s);
        }
      };
      chips("#s-s", SENS.map((k) => SN.SENSORS[k].n), "s", SENS.map((k) => SENS_TIP[k])); chips("#s-t", TGT.map((t) => t[2]), "t", TGT.map((t) => t[3])); table(); tasks(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },
  };

  // ---------------- boot ----------------
  renderList();
  const m = (location.hash || "").match(/^#lesson-(\d+)$/);
  if (m && LESSONS[+m[1] - 1]) openLesson(+m[1] - 1);
  window.__learn = { LESSONS };
})();
