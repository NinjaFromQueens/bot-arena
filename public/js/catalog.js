/* What students can finish, for the teacher dashboard and its spreadsheet, and the pictures for picture passwords.
   UMD: the server (spreadsheet) and the browser (dashboard, sign-in) share it. LESSONS is the lesson files in index.json's
   order with their Recruit titles; test/accounts.test.js checks they match. Lab missions, Brain Challenges and tracks come from flight.js, challenges.js
   and race.js. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Catalog = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const LESSONS = [
    { id: "robot", n: "What makes a robot?" },
    { id: "sensors", n: "Robot senses" },
    { id: "ultrasonic", n: "Ultrasonic: seeing with sound" },
    { id: "lidar", n: "Lidar: seeing with light" },
    { id: "showdown", n: "Sensor showdown" },
    { id: "rules", n: "Think: if-then rules" },
    { id: "dcmotor", n: "DC motors and gears" },
    { id: "servo", n: "Servo motors" },
    { id: "stepper", n: "Stepper motors" },
    { id: "motorpick", n: "Pick the right motor" },
    { id: "links", n: "Links and joints" },
    { id: "armtorque", n: "Arm strength: levers and torque" },
    { id: "tradeoffs", n: "Weight and trade-offs" },
    { id: "thrust", n: "Thrust vs. weight" },
    { id: "landing", n: "Higher isn't always better" },
    { id: "engineer", n: "Think like an engineer" },
  ];
  // picture passwords: 3 of these, in order (the server stores their positions, so only add new pictures at the end)
  const PICS = [["🤖", "robot"], ["🚀", "rocket"], ["⭐", "star"], ["🐱", "cat"], ["🐶", "dog"], ["🍕", "pizza"], ["⚽", "ball"], ["🌈", "rainbow"], ["🍎", "apple"], ["🎸", "guitar"], ["🐢", "turtle"], ["🌙", "moon"]];
  return { LESSONS, PICS, PIC_LEN: 3 };
});
