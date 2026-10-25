/*
 * Brain challenges for practice mode — shared by the browser and Node tests.
 * Each challenge gives the student a fixed robot (only its Custom brain rules change) against a boss, over 10 fixed
 * seeds, so the same rules always get the same result. test/challenges.test.js checks that each answer in `hints`
 * wins and the naive rules lose. Run it after changing any battle number, and re-pick seeds if it fails.
 * Rule codes in `answer`/`naive` are parseCode's: condition, number, move.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.Challenges = factory(root.Engine);
})(typeof self !== "undefined" ? self : this, function (E) {
  const FIGHTS = 10, NEED = 6;
  const LIST = [
    {
      id: "bruiser", n: "Power up", you: "ROOKIE-20300", boss: "BRUISER-12001", seed: 291,
      intro: "BRUISER has thick armor, so your small hits barely hurt it. Your Camera and Gripper hit almost every time, though.",
      hints: ["You hit about 9 times out of 10. Can you make each hit bigger?", "Try: IF always THEN power attack."],
      lesson: "Power attacks hit harder. They miss a little more, but when you hit often, the bigger hits win, and more of each one gets through the armor.",
      answer: "001", naive: ["", "322113"],
    },
    {
      id: "turtle", n: "Shield breaker", you: "ROOKIE-10300", boss: "TURTLE-12322-003", seed: 1,
      intro: "TURTLE raises its shield every chance it gets. A shield cuts your next hit in half, and then TURTLE hits back harder.",
      hints: ["One move smashes right through a shield.", "Try: IF the enemy's shield is up THEN power attack."],
      lesson: "Power attacks smash shields: full damage, and no counterattack. Checking the enemy's shield is your robot reacting to what it senses.",
      answer: "401", naive: ["", "322113", "003", "002"],
    },
    {
      id: "ghost", n: "Hard to hit", you: "ROOKIE-12310", boss: "GHOST-21233", seed: 651,
      intro: "GHOST has Legs and an Ultrasonic sensor, so it dodges a lot. Your Hammer only hits about 1 swing in 4.",
      hints: ["Look at your hit chance in the battle log. When it's low, a careful shot beats a wild swing.", "Try: IF my hit chance is below 40% THEN aim first."],
      lesson: "Aiming first skips one attack, but the next one is much more likely to hit. That's worth it when your hit chance is low.",
      answer: "322", naive: ["", "001", "003"],
    },
    {
      id: "smasher", n: "Big hitter", you: "ROOKIE-21320", boss: "SMASHER-31015", seed: 3281,
      intro: "SMASHER swings a giant hammer. It misses a lot, but one hit takes about a third of your health.",
      hints: ["You can't stop SMASHER from swinging, but you can make its hits hurt less.", "Try: IF always THEN shield."],
      lesson: "A shield cuts the next hit in half, then you counterattack with extra power. Shields are best against robots that hit hard.",
      answer: "003", naive: ["", "001", "322", "002", "322113"],
    },
    {
      id: "mega", n: "Final boss", you: "ROOKIE-32310", boss: "MEGA-00134", seed: 3351,
      intro: "MEGA is fast, raises a shield when it gets hurt, and flips robots over. Good news: your Wedge is too low to flip!",
      hints: ["You'll need more than one rule. What should you do when MEGA's shield is up?", "Your Hammer struggles to hit fast Wheels. When your hit chance is low, aim first.", "Rules are checked top to bottom, so order matters. Try: 1. IF the enemy's shield is up THEN power attack. 2. IF my hit chance is below 40% THEN aim first. 3. IF always THEN power attack."],
      lesson: "You wrote a real robot program: react to the enemy, aim when it's hard, and power up the rest of the time. Rules are checked top to bottom, so order matters.",
      answer: "401322001", naive: ["", "001", "002", "003", "401", "322", "322113", "322401001"],
    },
  ];
  const rulesOf = (code) => (code.match(/.../g) || []).map((t) => ({ c: +t[0], v: +t[1], a: +t[2] }));
  // the student's robot with these rules, and the boss
  function bots(ch, rules) {
    return [E.sanitizeBot({ ...E.parseCode(ch.you), rules: rules.map((r) => ({ ...r })) }), E.parseCode(ch.boss)];
  }
  function run(ch, rules) {
    const [a, b] = bots(ch, rules);
    if (!a) return null;
    const fights = [];
    for (let k = 0; k < FIGHTS; k++) fights.push({ seed: ch.seed + k, won: E.simulate(a, b, ch.seed + k).winner === 0 });
    const wins = fights.filter((f) => f.won).length;
    return { a, b, fights, wins, passed: wins >= NEED };
  }
  return { FIGHTS, NEED, LIST, rulesOf, bots, run };
});
