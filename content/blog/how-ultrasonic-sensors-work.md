---
{
  "slug": "how-ultrasonic-sensors-work",
  "title": "How do ultrasonic sensors work, and why can't they see a couch?",
  "answer": "An ultrasonic sensor chirps a sound too high for people to hear, then times the echo. Sound travels about 343 meters per second and makes a round trip, so distance equals 343 times the time, divided by 2. Soft things like couches soak up the chirp, so the robot hears nothing and thinks the path is clear.",
  "summary": "How ultrasonic distance sensors time echoes, the math behind them, and the three things that fool them: soft surfaces, tilted walls and distance past 4 m.",
  "topic": "lessons-explained",
  "date": "2026-11-22",
  "updated": "2026-11-22",
  "image": "/img/blog/ultrasonic-echo.webp",
  "alt": "The lesson's ultrasonic simulator: a robot's chirp spreads out in a cone, bounces off a hard wall 2 m away and comes back as an echo. The sensor's range ends at about 4 m.",
  "try": { "lesson": "ultrasonic", "game": "practice" },
  "facts": [
    { "claim": "The chirp vibrates 40,000 times per second; people hear up to about 20,000", "source": "public/data/lessons/ultrasonic.json" },
    { "claim": "Sound travels about 343 m/s", "source": "public/js/sensors.js SOUND" },
    { "claim": "An echo after 10 ms means about 1.7 m; after 6 ms, about 1.0 m", "source": "public/data/lessons/ultrasonic.json" },
    { "claim": "A wall 2 m away sends the echo back in about 11.7 ms", "source": "sensors.js read(): 2 × 2 ÷ 343 = 0.0117 s" },
    { "claim": "A typical classroom ultrasonic sensor can't hear echoes from more than about 4 m", "source": "public/js/sensors.js SENSORS.ultrasonic.range, lesson text" },
    { "claim": "In the simulator the cone's half-angle is 15°; a wall tilted more than that sends the echo off to the side", "source": "public/js/sensors.js SENSORS.ultrasonic.cone, read()" },
    { "claim": "Soft fabric soaks up the sound; glass echoes for ultrasonic but lidar's laser goes straight through it", "source": "public/js/sensors.js SURFACES" },
    { "claim": "Bot Arena's Ultrasonic sensor: measures distance, so it aims okay and dodges better", "source": "public/js/engine.js PARTS.sensor" }
  ],
  "faq": [
    { "q": "Why is it called ultrasonic?", "a": "Ultrasonic means beyond sound. The chirp vibrates about 40,000 times per second, and people can only hear up to about 20,000, so it's too high for us to hear." },
    { "q": "How do you calculate distance from an ultrasonic echo?", "a": "Multiply the echo time by the speed of sound, about 343 meters per second, then divide by 2, because the sound goes there and back. An echo after 10 milliseconds means about 1.7 meters." },
    { "q": "How far can an ultrasonic sensor measure?", "a": "A typical classroom ultrasonic sensor can't hear echoes from more than about 4 meters away. Past that, the sound spreads out and gets too weak." },
    { "q": "Can an ultrasonic sensor detect glass?", "a": "Yes. Sound bounces off a glass door like any hard wall. That's one place ultrasonic beats lidar, whose laser can go straight through clear glass." },
    { "q": "Why does my robot drive into the couch?", "a": "Soft things like couches, pillows and curtains soak up the chirp instead of bouncing it back. The sensor hears no echo, so the robot thinks the path is clear." }
  ],
  "related": ["what-is-sense-think-act", "what-is-circuit-rebels"],
  "status": "published"
}
---
Ultrasonic sensors are the eyes of most classroom robots, and they don't see at all: they listen. Understanding how they work, and how they fail, is one of the best ways to teach students that a robot only knows what its sensors tell it.

## Chirp, then listen

An ultrasonic sensor finds things the way a bat does: it chirps, then listens for the echo. It has two round parts on its front:

- a **speaker** that sends the chirp
- a **microphone** that hears the echo

The chirp vibrates about 40,000 times per second. People can only hear up to about 20,000, so it's too high for us. That's why it's called ultrasonic: beyond sound.

## The math: distance = 343 × time ÷ 2

The sensor starts a timer when it chirps and stops it when the echo comes back. Sound travels about 343 meters per second, and it goes there **and back**, so:

**distance = 343 × time ÷ 2**

The times are tiny, so we use milliseconds (thousandths of a second):

| Echo time | Distance |
|---|---|
| 6 ms | about 1.0 m |
| 10 ms | about 1.7 m |
| 11.7 ms | 2 m (the picture above) |

The "÷ 2" is the step students forget. Ask them why it's there before you explain it: the sound's trip is twice the distance to the wall.

## The cone

The chirp doesn't go out in a thin line. It spreads in a cone, like a flashlight beam, and the sensor reports the **closest** thing inside the cone. In the lesson's simulator, the cone spreads 15° to each side of straight ahead.

## Three things that fool it

Every one of these ends the same way: the robot hears nothing, decides the path is clear, and crashes.

| What fools it | Why | Example |
|---|---|---|
| **Soft things** | Fabric soaks up the sound instead of bouncing it back | Couches, pillows, curtains |
| **Tilted walls** | The sound bounces off to the side, like a ball hitting a wall at an angle, and the echo never reaches the microphone. In the simulator, a wall turned more than 15° does this. | A wall the robot meets at an angle |
| **Far things** | Sound gets weaker as it spreads out | Anything past about 4 m for a typical classroom sensor |

This is the Sense step failing. The robot's Think step is working perfectly: it heard no echo, so it decided the way was clear. It was wrong because of what it sensed, not how it thought.

## What about glass?

Glass doesn't fool an ultrasonic sensor: sound bounces off a glass door like any hard wall. That's where ultrasonic beats lidar, whose laser can go straight through clear glass. It's one reason many robots carry more than one kind of sensor.

## Try it in the simulator

The lesson's simulator shows the chirp in super slow motion. Students pick a target, set the distance and press Ping, with four experiments to finish:

1. Get an echo from the hard wall
2. Ping the pillow
3. Ping the tilted wall
4. Find a wall too far away to hear

Have students predict each result before they press Ping, then explain any surprise using the table above.

## In Bot Arena

In Bot Arena, the Ultrasonic sensor measures distance, so it aims okay and dodges better. It's a good choice for students who want a robot that's hard to hit, and a good way to start a conversation about what each sensor is best at.
