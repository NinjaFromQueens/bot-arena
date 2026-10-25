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
      id: "dcmotor", n: "DC motors and gears", about: "Why robots need gearboxes: trading speed for strength.",
      steps: [
        { type: "read", html: `<p class="big">A DC motor spins whenever electricity flows through it.</p>
          <svg class="part" viewBox="0 0 360 150" role="img" aria-label="A small hobby DC motor: a silver can with a metal shaft sticking out of one end and a red and a black wire on the other end.">
            <path d="M24 62 C12 62 8 70 6 86" fill="none" stroke-width="4" stroke-linecap="round" stroke="#ff5d5d"/>
            <path d="M24 90 C12 90 8 98 6 114" fill="none" stroke-width="4" stroke-linecap="round" stroke="#6d6a75"/>
            <rect x="24" y="44" width="200" height="64" rx="14" fill="#cfd2d8" stroke="#141316" stroke-width="3"/>
            <rect x="40" y="52" width="150" height="10" rx="5" fill="#eef0f3"/>
            <rect x="224" y="62" width="22" height="28" rx="4" fill="#8f8b98" stroke="#141316" stroke-width="3"/>
            <rect x="246" y="72" width="70" height="8" rx="3" fill="#8f8b98" stroke="#141316" stroke-width="2"/>
            <g font-family="JetBrains Mono, monospace" font-size="13" fill="#f4f1ea"><text x="246" y="112">shaft spins</text><text x="4" y="138">+ and − wires</text><text x="54" y="30">coil and magnets inside</text></g>
          </svg>
          <p>Inside, a coil of wire becomes a magnet when current flows through it. Magnets around the coil push and pull it, so it spins. Little metal brushes keep switching the current so it keeps turning.</p>
          <ul><li><b>More volts:</b> it spins faster.</li><li><b>Swap the two wires:</b> it spins the other way.</li></ul>` },
        { type: "read", html: `<h3>Fast but weak</h3>
          <p>A small motor spins thousands of times a minute (<b>rpm</b> means turns per minute). But its <b>torque</b>, its twisting strength, is tiny. Hook it straight to a wheel and a robot can't even climb a small ramp.</p>
          <p>A <b>gearbox</b> fixes that. A small gear on the motor turns a bigger gear on the wheel. With a <b>20:1</b> gearbox, the motor turns 20 times for every 1 turn of the wheel, so the wheel:</p>
          <ul><li>turns <b>20 times slower</b></li><li>pushes about <b>20 times harder</b> (a little less, because gears rub)</li></ul>
          <p class="small">Big ratios like 50:1 use several pairs of gears in a row.</p>` },
        { type: "interactive", kind: "dcsim" },
        { type: "read", html: `<h3>When a motor stalls</h3>
          <p>If the load is too heavy, the motor stops turning. That's called a <b>stall</b>. A stalled motor pulls the most electricity it can, and all that energy turns into heat. Leave it stalled and it can burn out.</p>
          <p>So engineers pick the gear ratio carefully: enough torque that it never stalls, but not so much gearing that the robot crawls.</p>` },
        { type: "quiz", q: "A motor spins at 6,000 rpm. It drives a wheel through a 20:1 gearbox. About how fast does the wheel turn?", options: ["120,000 rpm", "6,000 rpm", "300 rpm", "20 rpm"], answer: 2, explain: "The motor turns 20 times for each turn of the wheel: 6,000 ÷ 20 = 300 rpm." },
        { type: "quiz", q: "Your robot stalls halfway up a steep ramp. What's the best fix?", options: ["Use more gearing, like 50:1 instead of 5:1", "Use less gearing, like 1:1", "Make the robot heavier", "Paint it a faster color"], answer: 0, explain: "More gearing gives the wheels more torque, so the robot can climb. It goes slower, but it gets there." },
        { type: "quiz", q: "What does a gearbox trade?", options: ["Speed for strength (torque)", "Weight for color", "Batteries for wires", "Nothing. It just makes noise."], answer: 0, explain: "The wheel turns slower but pushes harder. That's the trade-off." },
      ],
      next: { label: "Build a robot in practice mode", href: "/practice" },
    },
    {
      id: "servo", n: "Servo motors", about: "Motors that move to an exact angle, like the joints of a robot arm.",
      steps: [
        { type: "read", html: `<p class="big">A servo moves to an angle you choose, then holds it there.</p>
          <svg class="part" viewBox="0 0 360 160" role="img" aria-label="Inside a servo: a small motor, gears, a position sensor and a control chip, with three wires coming out.">
            <rect x="20" y="40" width="250" height="96" rx="12" fill="#2468b3" stroke="#141316" stroke-width="3"/>
            <rect x="110" y="16" width="70" height="24" rx="6" fill="#2468b3" stroke="#141316" stroke-width="3"/>
            <rect x="128" y="6" width="90" height="14" rx="7" fill="#f4f1ea" stroke="#141316" stroke-width="3"/>
            <g fill="#173f6b" stroke="#141316" stroke-width="2"><rect x="32" y="52" width="104" height="36" rx="6"/><rect x="146" y="52" width="112" height="36" rx="6"/><rect x="32" y="94" width="104" height="32" rx="6"/><rect x="146" y="94" width="112" height="32" rx="6"/></g>
            <g font-family="JetBrains Mono, monospace" font-size="13" fill="#f4f1ea" text-anchor="middle"><text x="84" y="75">motor</text><text x="202" y="75">gears</text><text x="84" y="115">sensor</text><text x="202" y="115">chip</text></g>
            <g stroke-width="4" fill="none" stroke-linecap="round"><path d="M270 100 C300 100 310 110 340 112" stroke="#ff5d5d"/><path d="M270 108 C300 108 310 118 340 122" stroke="#141316"/><path d="M270 116 C300 116 310 126 340 132" stroke="#ffd23f"/></g>
            <text x="300" y="152" font-family="JetBrains Mono, monospace" font-size="12" fill="#aaa6b0" text-anchor="middle">3 wires</text>
          </svg>
          <p>Inside the little box: a small DC motor, gears to make it strong, a <b>position sensor</b> that measures the angle, and a <b>control chip</b>.</p>
          <p>That makes a servo a tiny robot of its own. The sensor <b>Senses</b> the angle, the chip <b>Thinks</b> about how far off it is, and the motor <b>Acts</b> to fix it. The joints of our robot arm are servos.</p>` },
        { type: "read", html: `<h3>Talking to a servo</h3>
          <p>The robot's computer sends the servo a short pulse of electricity every <b>20 milliseconds</b> (50 times a second). How long each pulse lasts tells the servo where to point:</p>
          <ul><li><b>1.0 ms</b> pulse: one end (0°)</li><li><b>1.5 ms</b> pulse: the middle (90°)</li><li><b>2.0 ms</b> pulse: the other end (180°)</li></ul>
          <p class="small">These are typical numbers, and each servo model is a little different. Changing the length of a pulse like this is called <b>PWM</b>, pulse width modulation.</p>` },
        { type: "interactive", kind: "servosim" },
        { type: "read", html: `<h3>It checks itself</h3>
          <p>A servo never stops checking. If something pushes the arm, the sensor notices the angle changed, and the motor pushes back until it's on target again. Checking and correcting like this is called <b>feedback</b>, or a <b>closed loop</b>.</p>
          <p>Some servos are built to spin all the way around instead. On those <b>continuous rotation</b> servos, the pulse sets the speed and direction instead of the angle.</p>` },
        { type: "quiz", q: "A servo gets a 1.5 ms pulse. Where does it point?", options: ["One end (0°)", "The middle (90°)", "The other end (180°)", "It spins forever"], answer: 1, explain: "1.5 ms is halfway between 1.0 ms and 2.0 ms, so the servo points to the middle." },
        { type: "quiz", q: "Which part inside a servo lets it know its own angle?", options: ["The gears", "The position sensor", "The wires", "The plastic case"], answer: 1, explain: "The position sensor measures the angle, so the chip knows how far the motor still has to turn." },
        { type: "quiz", q: "You push a servo's arm while it's holding 90°. What happens?", options: ["It stays wherever you push it", "It pushes back to 90°", "It turns off", "It jumps to 180°"], answer: 1, explain: "That's feedback: the sensor sees the angle changed, and the motor fixes it." },
      ],
      next: { label: "Build a robot in practice mode", href: "/practice" },
    },
    {
      id: "stepper", n: "Stepper motors", about: "Motors that move in tiny exact steps, like the ones in 3D printers.",
      steps: [
        { type: "read", html: `<p class="big">A stepper motor turns in tiny, exact steps.</p>
          <p>Around the middle are coils of wire. The controller turns them on one after another, and each switch pulls the magnet in the middle around by one step.</p>
          <p>Most steppers take <b>200 steps</b> to go all the way around. That's <b>1.8°</b> per step. Need a quarter turn? Send 50 steps.</p>
          <p>3D printers, laser cutters and CNC machines use steppers to move to exact spots.</p>` },
        { type: "read", html: `<h3>Counting without looking</h3>
          <p>A stepper has no sensor. The controller counts the steps it sends and assumes the motor followed. That's called an <b>open loop</b>.</p>
          <p>If the load is too heavy or the steps come too fast, the motor can't keep up and <b>skips steps</b>. The controller still thinks it's in the right place, but it isn't.</p>
          <p>When it's stopped, a stepper holds its position strongly. That's called <b>holding torque</b>.</p>` },
        { type: "interactive", kind: "stepsim" },
        { type: "read", html: `<h3>How a 3D printer stays on track</h3>
          <p>Before every print, a 3D printer <b>homes</b>: it moves each motor until a part taps a small switch at the edge. That switch is a touch sensor, and it tells the printer exactly where zero is. Then it counts steps from there.</p>
          <p>If a print suddenly looks shifted halfway up, the motors probably skipped steps.</p>` },
        { type: "quiz", q: "A stepper takes 200 steps per turn. How many steps make a quarter turn?", options: ["25", "50", "100", "200"], answer: 1, explain: "A quarter of 200 is 50, and 50 × 1.8° = 90°." },
        { type: "quiz", q: "Why can a stepper end up in the wrong place without knowing?", options: ["It has no sensor, so skipped steps go unnoticed", "Its wires are too short", "It can only turn left", "It runs out of steps"], answer: 0, explain: "The controller only counts the steps it sent. If the motor skips some, nothing tells it." },
        { type: "quiz", q: "Which machine is famous for using stepper motors?", options: ["A ceiling fan", "A 3D printer", "A drone", "A blender"], answer: 1, explain: "3D printers move the nozzle to exact spots by counting steps." },
      ],
      next: { label: "Build a robot in practice mode", href: "/practice" },
    },
    {
      id: "motorpick", n: "Pick the right motor", about: "DC, servo, stepper or brushless: match each job to the best motor.",
      steps: [
        { type: "read", html: `<p class="big">Every motor is good at a different job.</p>
          <table class="rtab"><thead><tr><th>Motor</th><th>Best at</th><th>Used in</th></tr></thead><tbody>
          <tr><td><b>DC gearmotor</b><small>DC motor + gearbox</small></td><td>spinning nonstop, simple speed control</td><td>robot car wheels, toys</td></tr>
          <tr><td><b>Servo</b><small>motor + sensor + chip</small></td><td>moving to an exact angle and holding it</td><td>robot arm joints, steering, grippers</td></tr>
          <tr><td><b>Stepper</b><small>coils switched in order</small></td><td>exact steps without a sensor</td><td>3D printers, CNC machines</td></tr>
          <tr><td><b>Brushless</b><small>needs a speed controller</small></td><td>very fast, powerful and efficient</td><td>drones, e-bikes, many electric cars</td></tr>
          </tbody></table>
          <p><b>Brushless</b> motors have no brushes rubbing inside. A small computer called an <b>ESC</b> (electronic speed controller) switches the coils instead, so they last longer and waste less energy.</p>` },
        { type: "interactive", kind: "motormatch" },
        { type: "read", html: `<h3>Real robots use a team of motors</h3>
          <ul><li><b>Robot vacuum:</b> DC gearmotors drive its wheels, and another motor spins its brushes.</li>
          <li><b>Our robot arm:</b> servos at the joints, so each one moves to an exact angle.</li>
          <li><b>3D printer:</b> steppers move the nozzle, and small fans cool the plastic.</li></ul>` },
        { type: "quiz", q: "A drone needs motors that spin its propellers super fast without wasting battery. Which kind?", options: ["Servo", "Stepper", "Brushless", "No motor"], answer: 2, explain: "Brushless motors are fast, powerful and efficient. That's why almost every drone uses them." },
        { type: "quiz", q: "In Bot Arena, what kind of motor would move each joint of a robot's Legs?", options: ["Servos", "One big fan motor", "A brushless drone motor", "No motor at all"], answer: 0, explain: "Walking robots move each leg joint to an exact angle, which is a servo's job." },
        { type: "quiz", q: "Which motor would you pick to drive a robot car's wheels?", options: ["A DC gearmotor", "A stepper with no controller", "A servo stuck at 90°", "A brushless motor with no speed controller"], answer: 0, explain: "A DC gearmotor spins nonstop with plenty of torque, which is just what wheels need." },
      ],
      next: { label: "Build a robot in practice mode", href: "/practice" },
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
  // a row of choice chips (one pressed); tips are the tooltips for each chip
  function chipRow(el, labels, tips, sel, onPick) {
    el.innerHTML = "";
    labels.forEach((l, i) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.setAttribute("aria-pressed", i === sel);
      if (tips) b.setAttribute("data-tip", tips[i]);
      b.onclick = () => { E.Sound.play("click"); onPick(i); };
      el.appendChild(b);
    });
  }
  const fmt0 = (n) => Math.round(n).toLocaleString("en-US");
  const fmtDeg = (d) => (Number.isInteger(d) ? String(d) : d.toFixed(1)) + "°";
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

    dcsim(card) {
      const MO = window.Motors, key = cur.step, LEN = 2; // the ramp is 2 m long
      const TASKS = [["stall", "Make the motor stall"], ["climb", "Climb the 25° ramp"], ["best", "Find the fastest gear for the 10° ramp"]];
      const RAMP_TIP = ["A flat track.", "A gentle 10° slope.", "A steep 25° slope."];
      const GEAR_TIP = ["No gearbox: the motor turns the wheels directly.", "The motor turns 5 times for every wheel turn.", "The motor turns 20 times for every wheel turn.", "The motor turns 50 times for every wheel turn."];
      const st = { ramp: 2, gear: 0, volt: 1, run: null, done: {}, last: 0, puff: 0 };
      const fx = new E.FX();
      card.innerHTML = `<h3>Gearbox simulator</h3><p>Pick a ramp, a gearbox and a battery, then press <b>Go!</b> Predict first: can the robot climb the steep ramp with no gearbox?</p>
        <div class="sim"><canvas aria-label="Side view: a robot drives up a ramp. A diagram shows the motor gear turning the wheel gear."></canvas></div>
        <div class="lbl">Ramp</div><div class="chips" id="d-ramp"></div>
        <div class="lbl">Gearbox</div><div class="chips" id="d-gear"></div>
        <div class="simrow"><div><div class="lbl">Battery</div><div class="chips" id="d-volt"></div></div><button class="btn" id="d-go" type="button" data-tip="Drive up the ramp with these choices.">Go!</button></div>
        <div class="tq" tabindex="0" data-tip="The bar is the most twisting force the gearbox can give each wheel. The white line is what the ramp needs. Past the line, it climbs. Short of it, it stalls.">
          <div class="row"><span>Torque each wheel needs</span><b id="d-need">-</b></div><div class="row"><span>Most the motor and gears can give</span><b id="d-have">-</b></div>
          <div class="tqbar"><i id="d-havebar"></i><span id="d-needmark"></span></div></div>
        <div class="readout simout three"><div tabindex="0" data-tip="How fast the motor itself spins, in turns per minute."><b id="d-mrpm">-</b>motor rpm</div><div tabindex="0" data-tip="How fast the wheels turn, after the gearbox."><b id="d-wrpm">-</b>wheel rpm</div><div tabindex="0" data-tip="How fast the robot moves."><b id="d-spd">-</b>robot speed</div></div>
        <div class="lbl">Experiments</div><ul class="tasks" id="d-tasks"></ul><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const tasks = () => { q("#d-tasks").innerHTML = TASKS.map(([k, t]) => `<li${st.done[k] ? ' class="done"' : ""}>${t}</li>`).join(""); };
      const rows = () => {
        chipRow(q("#d-ramp"), MO.RAMPS.map((r) => (r ? r + "° ramp" : "Flat")), RAMP_TIP, st.ramp, (i) => { st.ramp = i; reset(); });
        chipRow(q("#d-gear"), MO.GEARS.map((g) => (g === 1 ? "None (1:1)" : g + ":1")), GEAR_TIP, st.gear, (i) => { st.gear = i; reset(); });
        chipRow(q("#d-volt"), MO.VOLTS.map((v) => v + " V"), MO.VOLTS.map((v) => `A ${v}-volt battery. More volts make the motor spin faster and push harder.`), st.volt, (i) => { st.volt = i; reset(); });
      };
      const reset = () => {
        st.run = null; ["#d-mrpm", "#d-wrpm", "#d-spd", "#d-need", "#d-have"].forEach((s) => (q(s).textContent = "-"));
        q("#d-havebar").style.width = "0"; q("#d-needmark").style.left = "0"; rows();
      };
      q("#d-go").onclick = () => {
        const g = MO.GEARS[st.gear], r = MO.RAMPS[st.ramp], v = MO.VOLTS[st.volt], res = MO.drive(g, r, v);
        const secs = res.stalled ? 0 : LEN / res.speed; // real time to the top, squeezed into 1-6 s on screen
        st.run = { t0: performance.now(), res, g, r, v, secs, show: res.stalled ? 2.2 : Math.max(1, Math.min(6, secs)), fin: false };
        q(".fb").innerHTML = ""; // the last run's result would be confusing during this one
        const mx = Math.max(res.need, res.have) * 1.15;
        q("#d-need").textContent = res.need.toFixed(3) + " N·m"; q("#d-have").textContent = res.have.toFixed(3) + " N·m";
        q("#d-havebar").style.width = (res.have / mx) * 100 + "%"; q("#d-havebar").className = res.stalled ? "bad" : "";
        q("#d-needmark").style.left = (res.need / mx) * 100 + "%";
        q("#d-mrpm").textContent = res.stalled ? "0" : fmt0(res.motorRpm); q("#d-wrpm").textContent = res.stalled ? "0" : fmt0(res.wheelRpm);
        q("#d-spd").textContent = res.stalled ? "0 m/s" : res.speed.toFixed(2) + " m/s";
        E.Sound.play(res.stalled ? "miss" : "go");
      };
      const finish = (run) => {
        run.fin = true; const { res, g, r, v } = run;
        if (res.stalled) st.done.stall = true;
        if (!res.stalled && r === 25) st.done.climb = true;
        const best = !res.stalled && r === 10 && g === MO.bestGear(10, v);
        if (best) st.done.best = true;
        tasks();
        const all = TASKS.every(([k]) => st.done[k]);
        if (all) { cur.ok[key] = true; setNext(true); }
        const msg = res.stalled
          ? `<b>Stalled!</b> Each wheel needs ${res.need.toFixed(3)} N·m to move, but ${g === 1 ? "with no gearbox" : `through this ${g}:1 gearbox`} it can only get ${res.have.toFixed(3)} N·m. More gearing means more torque.`
          : `<b>Made it!</b> ${res.speed.toFixed(2)} m/s, so the 2 m ${r ? "ramp" : "track"} took ${run.secs.toFixed(1)} seconds. The motor spun ${fmt0(res.motorRpm)} rpm${g === 1 ? ", and with no gearbox the wheels spun just as fast" : `, and the ${g}:1 gearbox turned that into ${fmt0(res.wheelRpm)} rpm at the wheels`}.${best ? " That's the fastest gear for this ramp!" : ""}`;
        setFb(card, !res.stalled || all, msg + (all ? "<br><b>All 3 experiments done!</b> Gears trade speed for torque." : ""));
        E.Sound.play(res.stalled ? "miss" : "beep");
      };
      const gear = (ctx, x, y, r, a, fill) => { // a simple gear: a disc with square teeth
        const n = Math.max(8, Math.round(r / 3.2));
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = fill; ctx.strokeStyle = "#141316"; ctx.lineWidth = 1.5;
        for (let i = 0; i < n; i++) { ctx.save(); ctx.rotate((i / n) * Math.PI * 2); ctx.fillRect(-r * 0.09 - 1.5, -r - 4, r * 0.18 + 3, 6); ctx.restore(); }
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(0, 0, Math.max(2, r * 0.18), 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(20,19,22,.5)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke(); // a mark so you can see it turn
        ctx.restore();
      };
      const draw = (now) => {
        const dt = Math.min(0.05, (now - (st.last || now)) / 1000); st.last = now;
        const { ctx, w, h } = E.fit(cv), run = st.run, g = MO.GEARS[st.gear], r = run ? run.r : MO.RAMPS[st.ramp], th = (r * Math.PI) / 180;
        const gy = h * 0.88, x0 = w * 0.33, L = w * 0.6, cl = w * 0.11, rw = w * 0.02;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#2b2a30"; ctx.fillRect(0, gy, w, h - gy);
        const ex = x0 + Math.cos(th) * L, ey = gy - Math.sin(th) * L;
        ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
        if (r) { ctx.fillStyle = "#3a3842"; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(ex, ey); ctx.lineTo(ex, gy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else { ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(x0, gy - 1); ctx.lineTo(ex, gy - 1); ctx.stroke(); ctx.setLineDash([]); }
        ctx.fillStyle = "#4fd18b"; ctx.fillRect(ex - 2, ey - h * 0.13, 3, h * 0.13); ctx.beginPath(); ctx.moveTo(ex + 1, ey - h * 0.13); ctx.lineTo(ex + h * 0.07, ey - h * 0.1); ctx.lineTo(ex + 1, ey - h * 0.07); ctx.fill(); // finish flag
        const fs = Math.max(11, Math.round(h * 0.04));
        ctx.font = `700 ${fs}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.textAlign = "left";
        ctx.fillText(r ? `${r}° ramp · 2 m` : "flat · 2 m", x0 + w * 0.05, gy + fs + 4);
        // where the robot is
        let along = 0, shake = 0, stalled = false;
        if (run) {
          const k = Math.min(1, (now - run.t0) / 1000 / run.show);
          if (run.res.stalled) { stalled = k < 1 || run.fin; shake = run.fin ? 0 : Math.sin(now / 16) * 2.2; } else along = k * (L - cl); // steady speed, like the real motor
          if (stalled && !run.fin && (st.puff -= dt) <= 0) { st.puff = 0.18; fx.burst(x0 + Math.cos(th) * cl * 0.45, gy - Math.sin(th) * cl * 0.45 - rw * 3.6, 2, { colors: ["#6d6a75", "#8a8792"], kind: "smoke", speed: 30, g: -60, life: 1.2, size: 6, drag: 0.95, angle: -Math.PI / 2, spread: 1 }); }
          if (!run.fin && k >= 1) finish(run);
        }
        const roll = along / rw; // wheels roll without slipping
        const cx = x0 + Math.cos(th) * (along + cl / 2), cy = gy - Math.sin(th) * (along + cl / 2);
        ctx.save(); ctx.translate(cx + shake, cy); ctx.rotate(-th); ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
        ctx.fillStyle = "#f46524"; E.rr(ctx, -cl / 2, -rw * 2.7, cl, rw * 1.8, rw * 0.4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = stalled ? "#ff5d5d" : "#cfd2d8"; E.rr(ctx, -cl * 0.22, -rw * 3.7, cl * 0.42, rw * 1.05, rw * 0.35); ctx.fill(); ctx.stroke();
        [-cl * 0.32, cl * 0.32].forEach((wx) => {
          ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(wx, -rw, rw, 0, 7); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "#8f8b98"; ctx.lineWidth = 2; for (let s = 0; s < 3; s++) { const a = roll + s * 2.094; ctx.beginPath(); ctx.moveTo(wx, -rw); ctx.lineTo(wx + Math.cos(a) * rw * 0.75, -rw + Math.sin(a) * rw * 0.75); ctx.stroke(); }
          ctx.strokeStyle = "#141316";
        });
        ctx.restore();
        fx.update(dt); fx.draw(ctx);
        // gear diagram: the motor's small gear drives the wheel's big gear
        const pr = Math.max(h * 0.045, 11), R = pr * Math.min(g, 3.5), px = w * 0.04 + pr + 4, py = h * 0.3, gx = px + pr + R + 2;
        const jitter = stalled && !(run && run.fin) ? Math.sin(now / 16) * 0.08 : 0;
        gear(ctx, gx, py, R, -roll + jitter * 0.2, "#8f8b98");
        gear(ctx, px, py, pr, roll * (R / pr) + jitter, stalled ? "#ff5d5d" : "#cfd2d8");
        ctx.font = `600 ${Math.max(10, fs - 2)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.textAlign = "left";
        ctx.fillText("motor gear → wheel gear", px - pr, py + Math.max(pr, R) + fs + 6); ctx.textAlign = "center";
        ctx.font = `700 ${fs + 4}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "#ffd23f";
        ctx.fillText(g === 1 ? "1:1" : `${g}:1`, (px + gx) / 2, py - Math.max(pr, R) - 12);
        if (stalled && !(run && run.fin)) { ctx.fillStyle = "#ff5d5d"; ctx.fillText("STALLED!", x0 + cl / 2, gy - h * 0.3); }
        if (run && run.fin && !run.res.stalled) { ctx.fillStyle = "#4fd18b"; ctx.fillText(`${run.secs.toFixed(1)} s`, ex - w * 0.04, ey - h * 0.16); }
        ctx.textAlign = "left";
      };
      rows(); tasks(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },

    servosim(card) {
      const MO = window.Motors, key = cur.step;
      const BLOCKS = [[45, "#ff5d5d"], [135, "#38a7f0"]];
      const TASKS = [["b45", "Point the arm at the red block (45°)"], ["b135", "Point the arm at the blue block (135°)"], ["push", "Push the arm and watch it fix itself"]];
      const st = { ms: 1.5, angle: 90, done: {}, pushed: false, last: 0, shown: 0 };
      card.innerHTML = `<h3>Servo simulator</h3><p>Slide the pulse width to aim the servo's arm. The bottom shows the signal the robot's computer sends. Then push the arm and see what the servo does.</p>
        <div class="sim"><canvas aria-label="A servo with an arm that turns from 0 to 180 degrees, two target blocks, and the pulse signal underneath."></canvas></div>
        <div class="slider" data-tip="How long each pulse lasts, in milliseconds. 1.0 ms points to 0°, 1.5 ms to 90°, 2.0 ms to 180°."><div class="row"><span>Pulse width</span><b id="v-ms"></b></div><input type="range" id="v-range" min="1" max="2" step="0.05" aria-label="Pulse width in milliseconds"></div>
        <div class="simrow"><div class="readout simout" style="flex:1"><div tabindex="0" data-tip="The angle this pulse width asks for."><b id="v-target">-</b>target angle</div><div tabindex="0" data-tip="What the position sensor inside the servo measures right now."><b id="v-sense">-</b>sensor reads</div></div>
        <button class="btn ghost" id="v-push" type="button" data-tip="Shove the arm away from its target.">Push the arm</button></div>
        <div class="lbl">Experiments</div><ul class="tasks" id="v-tasks"></ul><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const tasks = () => { q("#v-tasks").innerHTML = TASKS.map(([k, t]) => `<li${st.done[k] ? ' class="done"' : ""}>${t}</li>`).join(""); };
      const complete = (k, msg) => {
        if (st.done[k]) return;
        st.done[k] = true; tasks(); E.Sound.play("beep");
        const all = TASKS.every(([t]) => st.done[t]);
        if (all) { cur.ok[key] = true; setNext(true); }
        setFb(card, true, msg + (all ? "<br><b>All 3 done!</b> A servo is a tiny robot: Sense, Think, Act." : ""));
      };
      const setMs = (ms) => { st.ms = Math.round(ms * 100) / 100; q("#v-range").value = st.ms; q("#v-ms").textContent = st.ms.toFixed(2) + " ms"; };
      q("#v-range").addEventListener("input", (e) => setMs(+e.target.value));
      q("#v-push").onclick = () => { st.angle = Math.max(0, Math.min(180, st.angle + (st.angle < 120 ? 55 : -55))); st.pushed = true; E.Sound.play("hit"); };
      const draw = (now) => {
        const dt = Math.min(0.05, (now - (st.last || now)) / 1000); st.last = now;
        const target = MO.servoAngle(st.ms);
        st.angle = MO.servoStep(st.angle, target, dt);
        const settled = Math.abs(st.angle - target) < 0.5;
        if (settled && target === 45) complete("b45", "<b>On target!</b> A 1.25 ms pulse means 45°.");
        if (settled && target === 135) complete("b135", "<b>On target!</b> A 1.75 ms pulse means 135°.");
        if (st.pushed && settled) { st.pushed = false; complete("push", "<b>It fixed itself!</b> The sensor saw the arm move, so the motor pushed it back. That's feedback."); }
        if (now - st.shown > 100) { st.shown = now; q("#v-target").textContent = fmtDeg(Math.round(target)); q("#v-sense").textContent = fmtDeg(Math.round(st.angle)); }
        const { ctx, w, h } = E.fit(cv);
        ctx.clearRect(0, 0, w, h);
        const scopeY = h * 0.7, cx = w / 2, cy = scopeY - h * 0.1, R = Math.min(w * 0.3, h * 0.46);
        const P = (deg, rad) => [cx + Math.cos((deg * Math.PI) / 180) * rad, cy - Math.sin((deg * Math.PI) / 180) * rad];
        const fs = Math.max(11, Math.round(h * 0.038));
        ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke(); // protractor
        ctx.font = `600 ${fs}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (let d = 0; d <= 180; d += 15) {
          const [x1, y1] = P(d, R), [x2, y2] = P(d, R - (d % 45 ? 6 : 12));
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          if (d % 45 === 0) { const [tx, ty] = P(d, R + fs * 1.3); ctx.fillText(d + "°", tx, ty); }
        }
        BLOCKS.forEach(([d, c]) => { const [bx, by] = P(d, R * 0.84), s = R * 0.12; ctx.fillStyle = c; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; E.rr(ctx, bx - s / 2, by - s / 2, s, s, 3); ctx.fill(); ctx.stroke(); });
        const [tx, ty] = P(target, R * 0.7); // where the pulse asks it to point
        ctx.strokeStyle = "rgba(255,138,80,.7)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#2468b3"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; E.rr(ctx, cx - R * 0.42, cy - R * 0.12, R * 0.84, R * 0.32, 8); ctx.fill(); ctx.stroke(); // servo body
        const [ax, ay] = P(st.angle, R * 0.62);
        ctx.strokeStyle = "#141316"; ctx.lineWidth = R * 0.11; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = "#f4f1ea"; ctx.lineWidth = R * 0.075; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke(); ctx.lineCap = "butt";
        ctx.fillStyle = "#f4f1ea"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.07, 0, 7); ctx.fill(); ctx.stroke();
        // the signal: one pulse every 20 ms, drawn over a 40 ms window
        const sx = w * 0.06, sw = w * 0.88, sy = scopeY + h * 0.03, sh = h * 0.24, base = sy + sh * 0.85, top = sy + sh * 0.42, perMs = sw / 40;
        ctx.fillStyle = "#121116"; E.rr(ctx, sx, sy, sw, sh, 8); ctx.fill();
        ctx.strokeStyle = "rgba(79,209,139,.14)"; ctx.lineWidth = 1; for (let m = 0; m <= 40; m += 5) { ctx.beginPath(); ctx.moveTo(sx + m * perMs, sy); ctx.lineTo(sx + m * perMs, sy + sh); ctx.stroke(); }
        ctx.strokeStyle = "#4fd18b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx, base);
        for (let p = 0; p < 2; p++) { const x = sx + (p * 20 + 2) * perMs; ctx.lineTo(x, base); ctx.lineTo(x, top); ctx.lineTo(x + st.ms * perMs, top); ctx.lineTo(x + st.ms * perMs, base); }
        ctx.lineTo(sx + sw, base); ctx.stroke();
        ctx.textAlign = "left"; ctx.fillStyle = "#4fd18b"; ctx.font = `600 ${Math.max(10, fs - 1)}px "JetBrains Mono", monospace`;
        ctx.fillText(`${st.ms.toFixed(2)} ms pulse, every 20 ms`, sx + 8, sy + fs * 0.9);
        ctx.textBaseline = "alphabetic";
      };
      setMs(st.ms); tasks(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },

    stepsim(card) {
      const MO = window.Motors, key = cur.step, PER = 360 / MO.STEPPER.stepsPerRev;
      const TASKS = [["quarter", "Make an exact quarter turn (90°)"], ["skip", "Make it skip steps"], ["full", "Make exactly one full turn (360°)"]];
      const STEPS = [10, 50, 100, 200], LOADS = ["light", "heavy"];
      const st = { si: 1, load: 0, rate: 400, sent: 0, moved: 0, run: null, done: {} };
      card.innerHTML = `<h3>Stepper simulator</h3><p>Pick how many steps to send, how fast, and how heavy the load is. The left side shows the coils switching on in order. Each run starts from 0°.</p>
        <div class="sim"><canvas aria-label="Left: a stepper's four coils and the magnet in the middle. Right: a dial showing where the shaft really is and where the controller thinks it is."></canvas></div>
        <div class="lbl">Steps to send</div><div class="chips" id="p-steps"></div>
        <div class="lbl">Load</div><div class="chips" id="p-load"></div>
        <div class="slider" data-tip="How many steps the controller sends each second. Too fast for the load and the motor can't keep up."><div class="row"><span>Speed</span><b id="p-rv"></b></div><input type="range" id="p-rate" min="100" max="1000" step="50" aria-label="Steps per second"></div>
        <div class="btnrow"><button class="btn" id="p-run" type="button" data-tip="Send the steps from 0°.">Run</button><button class="btn ghost" id="p-one" type="button" data-tip="Send a single step and watch the next coil switch on.">Step once</button></div>
        <div class="readout simout three"><div tabindex="0" data-tip="Steps the controller has sent."><b id="p-sent">0</b>steps sent</div><div tabindex="0" data-tip="Where the controller thinks the shaft is: steps × 1.8°."><b id="p-thinks">0°</b>controller thinks</div><div tabindex="0" data-tip="Where the shaft really is."><b id="p-real">0°</b>really turned</div></div>
        <div class="lbl">Experiments</div><ul class="tasks" id="p-tasks"></ul><div class="fb"></div>`;
      const q = (sel) => card.querySelector(sel), cv = q("canvas");
      const tasks = () => { q("#p-tasks").innerHTML = TASKS.map(([k, t]) => `<li${st.done[k] ? ' class="done"' : ""}>${t}</li>`).join(""); };
      const rows = () => {
        chipRow(q("#p-steps"), STEPS.map((n) => n + " steps"), STEPS.map((n) => `${n} × 1.8° = ${fmtDeg(n * PER)}`), st.si, (i) => { st.si = i; rows(); });
        chipRow(q("#p-load"), ["Light load", "Heavy load"], ["Easy to turn. It can follow up to 800 steps per second.", "Hard to turn. Past 250 steps per second it starts to slip."], st.load, (i) => { st.load = i; rows(); });
      };
      const readouts = () => { q("#p-sent").textContent = st.sent; q("#p-thinks").textContent = fmtDeg(st.sent * PER); q("#p-real").textContent = fmtDeg(st.moved * PER); };
      const setRate = (r) => { st.rate = r; q("#p-rate").value = r; q("#p-rv").textContent = r + " steps/s"; };
      q("#p-rate").addEventListener("input", (e) => setRate(+e.target.value));
      const complete = (msg, good) => {
        tasks();
        const all = TASKS.every(([t]) => st.done[t]);
        if (all) { cur.ok[key] = true; setNext(true); }
        setFb(card, good || all, msg + (all ? "<br><b>All 3 done!</b> Steppers are exact, as long as they don't skip." : ""));
      };
      q("#p-run").onclick = () => {
        if (st.run && !st.run.fin) return;
        const n = STEPS[st.si], load = LOADS[st.load];
        st.sent = 0; st.moved = 0;
        st.run = { t0: performance.now(), n, rate: st.rate, load, res: MO.stepperRun(n, st.rate, load), show: Math.max(0.8, Math.min(3, n / st.rate * 2)), fin: false };
        E.Sound.play("scan");
      };
      q("#p-one").onclick = () => {
        if (st.run && !st.run.fin) return;
        st.sent++; st.moved++; readouts(); E.Sound.play("click"); // single steps are slow, so they never slip
        if (st.sent === 50 && st.moved === 50 && !st.done.quarter) { st.done.quarter = true; complete("<b>Exactly 90°!</b> 50 steps × 1.8° = 90°.", true); }
      };
      const finish = (run) => {
        run.fin = true; const { n, res } = run;
        st.sent = n; st.moved = res.moved; readouts();
        if (res.moved < n) {
          st.done.skip = true; E.Sound.play("miss");
          complete(`<b>Skipped steps!</b> It sent ${n} steps, so the controller thinks the shaft turned ${fmtDeg(res.thinksDeg)}. It really turned ${fmtDeg(res.realDeg)}. With no sensor, nothing noticed. A slower speed or a lighter load keeps every step.`, false);
        } else {
          if (n === 50) st.done.quarter = true;
          if (n === 200) st.done.full = true;
          E.Sound.play("beep");
          complete(`<b>Every step landed.</b> ${n} steps × 1.8° = ${fmtDeg(res.realDeg)}, and the shaft really turned ${fmtDeg(res.realDeg)}.`, true);
        }
      };
      const draw = (now) => {
        const run = st.run;
        if (run && !run.fin) {
          const k = Math.min(1, (now - run.t0) / 1000 / run.show), sent = Math.floor(k * run.n);
          st.sent = sent; st.moved = MO.stepperRun(sent, run.rate, run.load).moved; readouts();
          if (k >= 1) finish(run);
        }
        const { ctx, w, h } = E.fit(cv);
        ctx.clearRect(0, 0, w, h);
        const fs = Math.max(11, Math.round(h * 0.04));
        // left: the simple model, four coils around a magnet
        const lx = w * 0.27, ly = h * 0.5, Rs = Math.min(w * 0.17, h * 0.36), active = st.sent % 4, rotor = st.moved % 4;
        ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
        ctx.fillStyle = "#2b2a30"; ctx.beginPath(); ctx.arc(lx, ly, Rs, 0, 7); ctx.fill(); ctx.stroke();
        MO.COILS.forEach((name, i) => {
          const a = -Math.PI / 2 + (i * Math.PI) / 2, on = i === active;
          ctx.save(); ctx.translate(lx + Math.cos(a) * Rs * 0.72, ly + Math.sin(a) * Rs * 0.72); ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = on ? "#f46524" : "#55535c"; E.rr(ctx, -Rs * 0.16, -Rs * 0.14, Rs * 0.32, Rs * 0.28, 4); ctx.fill(); ctx.stroke();
          if (on) { ctx.shadowColor = "#f46524"; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0; }
          ctx.restore();
          ctx.font = `700 ${fs}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = on ? "#ff8a50" : "#aaa6b0";
          ctx.fillText(name, lx + Math.cos(a) * (Rs + fs * 1.1), ly + Math.sin(a) * (Rs + fs * 1.1));
        });
        const ra = -Math.PI / 2 + (rotor * Math.PI) / 2; // the magnet points at the coil it last followed
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(ra);
        ctx.fillStyle = "#ff5d5d"; E.rr(ctx, 0, -Rs * 0.09, Rs * 0.42, Rs * 0.18, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#38a7f0"; E.rr(ctx, -Rs * 0.42, -Rs * 0.09, Rs * 0.42, Rs * 0.18, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#f4f1ea"; ctx.font = `700 ${Math.round(Rs * 0.13)}px "JetBrains Mono", monospace`; ctx.fillText("N", Rs * 0.28, 1);
        ctx.restore();
        ctx.font = `600 ${Math.max(10, fs - 2)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0";
        ctx.fillText(w < 520 ? "4-step model" : "simple model: 4 steps per turn", lx, h - fs * 0.8);
        if (active !== rotor) { ctx.font = `700 ${fs + 4}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "#ff5d5d"; ctx.fillText("SKIPPED!", lx, ly - Rs - fs * 2.4); }
        // right: the real motor's shaft, 200 steps per turn
        const dx = w * 0.72, dy = h * 0.5, Rd = Math.min(w * 0.2, h * 0.38), realA = st.moved * PER, thinkA = st.sent * PER;
        const A = (deg) => -Math.PI / 2 + (deg * Math.PI) / 180;
        ctx.fillStyle = "#1b1a1e"; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dx, dy, Rd, 0, 7); ctx.fill(); ctx.stroke();
        for (let s = 0; s < 200; s += 10) { const a = A(s * PER), long = s % 50 === 0; ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * Rd, dy + Math.sin(a) * Rd); ctx.lineTo(dx + Math.cos(a) * (Rd - (long ? 12 : 6)), dy + Math.sin(a) * (Rd - (long ? 12 : 6))); ctx.stroke(); }
        if (realA > 0) { ctx.strokeStyle = "rgba(79,209,139,.35)"; ctx.lineWidth = Rd * 0.12; ctx.beginPath(); ctx.arc(dx, dy, Rd * 0.8, A(0), A(Math.min(realA, 359.9))); ctx.stroke(); }
        const hand = (deg, col, dash, len) => { const a = A(deg); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(a) * Rd * len, dy + Math.sin(a) * Rd * len); ctx.stroke(); ctx.setLineDash([]); };
        if (thinkA !== realA) hand(thinkA, "#ff8a50", [7, 6], 0.9);
        hand(realA, "#f4f1ea", [], 0.78);
        ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.arc(dx, dy, 6, 0, 7); ctx.fill();
        ctx.font = `600 ${Math.max(10, fs - 2)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0";
        ctx.fillText(w < 520 ? "real: 200 steps/turn" : "real motor: 200 steps per turn", dx, h - fs * 0.8);
        ctx.fillStyle = "#f4f1ea"; ctx.fillText("white: really turned", dx, dy - Rd - fs * 1.6);
        if (thinkA !== realA) { ctx.fillStyle = "#ff8a50"; ctx.fillText("orange: controller thinks", dx, dy - Rd - fs * 0.5); }
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      };
      rows(); setRate(st.rate); readouts(); tasks(); setNext(!!cur.ok[key]);
      animate(cv, draw);
    },

    motormatch(card) {
      const rows = [["Spin a drone's propellers super fast", "Brushless"], ["Move a robot arm's elbow to exactly 45°", "Servo"], ["Slide a 3D printer's nozzle to exact spots", "Stepper"], ["Drive the wheels of a robot car", "DC gearmotor"], ["Steer a toy car's front wheels left and right", "Servo"]];
      const opts = ["DC gearmotor", "Servo", "Stepper", "Brushless"];
      card.innerHTML = `<h3>Match the job to the motor</h3><p>Pick the best motor for each job. A motor can be the answer more than once.</p><div class="match"></div><div class="fb"></div>`;
      const box = card.querySelector(".match"), fb = card.querySelector(".fb");
      const check = () => {
        let right = 0, all = true;
        [...box.children].forEach((r, i) => {
          const v = r.querySelector("select").value; if (!v) { all = false; r.className = "mrow"; return; }
          const ok = v === rows[i][1]; right += ok; r.className = "mrow " + (ok ? "right" : "wrong");
        });
        const done = all && right === rows.length;
        fb.innerHTML = all ? `<div class="feedback ${done ? "good" : "bad"}"><b>${done ? "All correct!" : `${right} of ${rows.length} right.`}</b> ${done ? "Speed: brushless. Angles: servo. Exact steps: stepper. Nonstop wheels: DC gearmotor." : "Fix the red ones."}</div>` : "";
        if (done) cur.ok[cur.step] = true;
        setNext(done || !!cur.ok[cur.step]);
      };
      rows.forEach(([job]) => {
        const r = document.createElement("div"); r.className = "mrow";
        r.innerHTML = `<span></span><select aria-label="Motor" data-tip="Pick the motor that fits this job best."><option value="">Pick...</option>${opts.map((o) => `<option>${o}</option>`).join("")}</select>`;
        r.querySelector("span").textContent = job;
        r.querySelector("select").onchange = () => { E.Sound.play("click"); check(); };
        box.appendChild(r);
      });
      setNext(!!cur.ok[cur.step]);
    },
  };

  // ---------------- boot ----------------
  renderList();
  const m = (location.hash || "").match(/^#lesson-(\d+)$/);
  if (m && LESSONS[+m[1] - 1]) openLesson(+m[1] - 1);
  window.__learn = { LESSONS };
})();
