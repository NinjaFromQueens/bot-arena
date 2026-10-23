// Sensor lesson tests: the simulators follow the rules the lesson text and quizzes teach.
const assert = require("assert");
const S = require("../public/js/sensors.js");
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected about ${b}`);

// what fools each sensor (lesson text, quizzes, and the Sensor Showdown checklist)
assert.strictEqual(S.read("ultrasonic", "soft", 1).reason, "absorb", "ultrasonic should miss the couch");
assert.strictEqual(S.read("ultrasonic", "wall", 2, 45).reason, "tilt", "ultrasonic should miss a 45° wall");
assert.strictEqual(S.read("ultrasonic", "wall", 4.5).reason, "far", "ultrasonic should miss past 4 m");
assert(S.read("ultrasonic", "glass", 0.6).ok, "ultrasonic should hear the glass door (quiz answer)");
assert(S.read("ultrasonic", "wall", 3.9).ok, "ultrasonic should hear a wall just inside 4 m");
assert.strictEqual(S.read("lidar", "glass", 0.6).reason, "pass", "lidar should see through glass");
for (const s of ["wall", "soft", "black"]) assert(S.read("lidar", s, 0.6).ok, `lidar should see the ${s}`);
assert(S.read("lidar", "wall", 2, 45).ok, "lidar should still see a tilted wall");
assert.strictEqual(S.read("infrared", "black", 0.6).reason, "absorb", "infrared should miss the black box");
assert.strictEqual(S.read("infrared", "glass", 0.6).reason, "pass", "infrared should see through glass");
assert.strictEqual(S.read("infrared", "wall", 3).reason, "far", "infrared should miss the far wall");
assert(S.read("infrared", "wall", 0.6).ok && S.read("infrared", "soft", 0.6).ok, "infrared should see a near wall and couch");

// every sensor has a blind spot among the Showdown targets (0.6 m targets plus the 3 m wall), so the activity can be finished
for (const k of Object.keys(S.SENSORS)) {
  const misses = Object.keys(S.SURFACES).some((f) => !S.read(k, f, 0.6).ok) || !S.read(k, "wall", 3).ok;
  assert(misses, `${k} needs a blind spot in the Showdown`);
}

// numbers used in the lessons and quizzes
near(S.read("ultrasonic", "wall", 2).time * 1000, 11.66, 0.01, "wall at 2 m echo (ms)");
near((S.SOUND * 0.006) / 2, 1.0, 0.05, "6 ms echo quiz -> about 1.0 m");
near(S.LIGHT * 1e-9, 0.3, 0.001, "light goes about 30 cm per nanosecond");
near((S.LIGHT * 20e-9) / 2, 3, 0.01, "20 ns lidar quiz -> 3 m");
near(S.LIGHT / S.SOUND / 1000, 870, 10, "light is about 870,000 times faster than sound");

// lidar ray casting: hits the nearest face, skips glass, can't see behind things
const room = S.segments([S.box(0, 0, 10, 6, "wall")]);
near(S.cast(room, 1, 3, 0, "lidar").dist, 9, 1e-9, "ray to the far wall");
const withGlass = room.concat(S.segments([{ pts: [[4, 0], [4, 6]], surface: "glass" }]));
near(S.cast(withGlass, 1, 3, 0, "lidar").dist, 9, 1e-9, "lidar sees through a glass wall");
assert.strictEqual(S.cast(withGlass, 1, 3, 0, "infrared"), null, "infrared reaches nothing in range");
const withBox = room.concat(S.segments([S.box(5, 2, 6, 4, "wall")]));
near(S.cast(withBox, 1, 3, 0, "lidar").dist, 4, 1e-9, "lidar stops at the near face of a box");
assert(S.inside(S.box(5, 2, 6, 4).pts, 5.5, 3) && !S.inside(S.box(5, 2, 6, 4).pts, 7, 3), "point-in-shape test");

console.log("Sensor tests passed");
