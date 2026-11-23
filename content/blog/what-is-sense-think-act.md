---
{
  "slug": "what-is-sense-think-act",
  "title": "What is Sense-Think-Act? A simple way to teach how robots work",
  "answer": "Sense-Think-Act is the loop every robot runs. It senses the world with sensors, thinks with a computer that decides what to do, and acts with motors, wheels or arms. If a machine is missing one of the three, or a person has to make every decision, it isn't a robot.",
  "summary": "Every robot senses, thinks and acts. Teach the loop with a robot vacuum, a quick sorting question and Bot Arena, where every move shows all three steps.",
  "topic": "lessons-explained",
  "date": "2026-11-22",
  "updated": "2026-11-22",
  "image": "/img/blog/sense-think-act.webp",
  "alt": "Three moments from a Bot Arena fight: the robot's camera aims at 79% to hit (Sense), its brain decides to go (Think), and its spinner hits for 21 (Act).",
  "try": { "lesson": "robot", "game": "practice" },
  "facts": [
    { "claim": "A robot is a machine that can sense, think and act on its own; missing one, or a person making every decision, means it isn't a robot", "source": "public/data/lessons/robot.json" },
    { "claim": "A robot vacuum: bump sensors feel walls and cliff sensors notice stairs; its computer decides; wheels drive and brushes clean", "source": "public/data/lessons/robot.json" },
    { "claim": "A robot's computer, like a Raspberry Pi, is the Think part; a camera spotting a block is Sense", "source": "public/data/lessons/robot.json quizzes" },
    { "claim": "Bot Arena robots have a body plus a sensor (Camera, Ultrasonic, Touch, Lidar), a brain (Aggressive, Defensive, Smart, Custom) and a tool (Gripper, Hammer, Spinner, Flipper, Drill)", "source": "public/js/engine.js PARTS, SLOTS" },
    { "claim": "Every move in a Bot Arena fight is a Sense, Think or Act step", "source": "public/practice.html, public/js/battle.js" },
    { "claim": "The picture's numbers (79% to hit, 21 damage) come from a real practice fight", "source": "captured from /practice#arena, Nov 22, 2026" }
  ],
  "faq": [
    { "q": "Is a remote-control car a robot?", "a": "No. A person makes every decision for it, so it has no Think step of its own. A robot vacuum is a robot: it senses walls and stairs, decides where to go, and drives itself." },
    { "q": "Which part of a robot is the Think step?", "a": "The computer that decides what to do, like a Raspberry Pi on a classroom robot arm. Its program turns what the sensors notice into a choice." },
    { "q": "What are examples of Sense, Think and Act parts?", "a": "Sense: cameras, ultrasonic sensors, lidar and touch sensors. Think: a computer running a program. Act: wheels, motors, arms, grippers and thrusters." },
    { "q": "How long does the Sense-Think-Act lesson take?", "a": "About 5 minutes. It's the first lesson in Circuit Rebels, and it ends with a sorting game and two quick questions." }
  ],
  "related": ["how-ultrasonic-sensors-work", "what-is-circuit-rebels"],
  "status": "published"
}
---
Sense-Think-Act is the first idea students meet in Circuit Rebels, because every other lesson hangs on it. Once students can name the three steps, they can look at any machine, from a robot vacuum to a self-driving car, and explain how it works.

## The three steps

| Step | What it does | Examples |
|---|---|---|
| **Sense** | Notices the world | Cameras, ultrasonic sensors, lidar, touch sensors |
| **Think** | Decides what to do | A computer running a program, like a Raspberry Pi |
| **Act** | Does something | Wheels, motors, arms, grippers, thrusters |

A robot runs the loop over and over: sense, think, act, then sense again to see what changed.

## Robot or not?

Here's the test students use: a robot does all three steps **on its own**. If a machine is missing one, or a person has to make every decision, it isn't a robot.

That settles a lot of classroom arguments. A remote-control car has motors (Act), but a person makes every choice, so it isn't a robot. A robot vacuum is: it senses walls and stairs, decides where to go, and drives itself.

## A robot vacuum, step by step

- **Sense:** bump sensors feel walls, and cliff sensors notice stairs.
- **Think:** its computer decides where to go next.
- **Act:** wheels drive and brushes clean.

Ask students what happens when one step fails. If the cliff sensor is covered with dust, the vacuum never senses the stairs, so its computer never decides to turn around. That's the whole idea in one example: a robot can only act on what it senses.

## Seeing the loop in Bot Arena

In Bot Arena, students build a robot from a body and three parts, one for each step:

- **Sense:** a sensor. The Camera aims best; Ultrasonic measures distance and dodges better; Touch feels hits coming; Lidar maps the enemy so exactly that dodging barely works against it.
- **Think:** a brain. Aggressive hits harder; Defensive raises a shield and hits back; Smart waits for a clear shot; Custom follows the student's own if-then rules.
- **Act:** a tool. Gripper, Hammer, Spinner, Flipper or Drill, each with its own trade-off.

Every move in a fight shows all three steps. In the picture above, the green robot's camera aims at its opponent (79% to hit), its brain decides to go, and its spinner lands a hit for 21. When a fight ends, the game explains why the winner won, so students learn to ask the right question: was it a sensing problem, a thinking problem or an acting problem?

## A quick classroom routine

1. Present the 5-minute lesson on the board. Its two questions become class polls.
2. Name three machines in the room or in students' lives, and sort each step into Sense, Think and Act. Then ask: is it a robot?
3. Open Bot Arena and have students build a robot, saying out loud which part does which step.
4. Run a class tournament. Before each fight, students predict the winner and explain their choice with Sense, Think and Act.

## Where it leads

Each later lesson zooms into one step. The sensor lessons go deep on Sense (what ultrasonic sensors and lidar can and can't detect). The motor and robot arm lessons are about Act. The if-then rules lesson opens up Think, and Brain Challenges let students program it themselves.
