---
{
  "slug": "what-is-circuit-rebels",
  "title": "What is Circuit Rebels?",
  "answer": "Circuit Rebels is a free, browser-based robotics program for grades 5 to 8. Students learn how machines sense, think and act in 5-minute lessons, then put each idea to work in class games like Bot Arena, Robot Racer and the Flying Car Lab. It runs on Chromebooks, and no student accounts are needed to play.",
  "summary": "A free, browser-based robotics program for grades 5 to 8: 5-minute lessons, class games and a story, run from the teacher's board with a join code.",
  "topic": "for-teachers",
  "date": "2026-11-22",
  "updated": "2026-11-22",
  "image": "/img/home/hero.webp",
  "alt": "Neo Harbor at sunset: a white tower glows on an island in the bay.",
  "try": { "lesson": "robot", "game": ["host", "map"] },
  "facts": [
    { "claim": "Grades 5 to 8; free; browser-based; no student accounts needed to play; runs on Chromebooks", "source": "content/blog/blog.json facts, public/index.html" },
    { "claim": "Students join a class game with the 4-letter code on the teacher's board", "source": "public/index.html join form, server.js room codes" },
    { "claim": "Every mission run asks for a prediction first, then explains the result and the one change made", "source": "public/js/missions.js, public/js/cards.js" },
    { "claim": "In a class game the board shows who predicted right on their first try", "source": "server.js missionData, public/js/host.js renderMissions" },
    { "claim": "Story missions have five steps: briefing, discover, build, mission, reward; one mission is one class period", "source": "public/js/story.js STEPS, docs/platform-flow-spec.md" },
    { "claim": "Class accounts are optional: teachers sign in with Google, students with a class code, their name and 3 pictures", "source": "lib/accounts.js" },
    { "claim": "Is it really free, robot kits, devices, faith content: answers match the home page word for word", "source": "public/index.html questions" }
  ],
  "faq": [
    { "q": "Is it really free?", "a": "Yes. Today's lessons and games are free, with no login. Story mode, teacher tools and class reports are being built, and schools will pay for those later." },
    { "q": "Do we need robot kits?", "a": "No. Everything runs in a web browser. Classes that own robot arms or rovers can use them alongside the lessons." },
    { "q": "What devices does it run on?", "a": "Chromebooks, laptops, tablets and phones. The teacher needs a projector or a board for class games. There is nothing to install." },
    { "q": "Do students need accounts?", "a": "No. Students join a class game with a 4-letter code. Classes that want saved progress can turn on class accounts: the teacher signs in with Google, and students sign in with a class code, their name and 3 pictures." },
    { "q": "What's in the story?", "a": "Story mode includes a Christian faith thread: a sealed church, memories of Christmas and Easter, and one character's search for why people believed. Today's lessons and games don't include it." }
  ],
  "related": ["what-is-sense-think-act", "how-ultrasonic-sensors-work"],
  "status": "published"
}
---
Circuit Rebels teaches robotics the way robots work: every machine senses the world, thinks about what to do, and acts. Students learn one idea at a time in a short lesson, then test it in a game where the idea decides whether they win.

## Who it's for

Circuit Rebels is built for grades 5 to 8: robotics classes, STEM electives, science classes and after-school programs. The teacher doesn't need to be a robotics expert. Every lesson explains its idea from scratch, and the games explain their own results.

## How a class period works

1. **The teacher opens the board.** Put Circuit Rebels on the projector and press Host a class. The board shows a 4-letter join code.
2. **Students join.** On a Chromebook, tablet or phone, students type the code and they're in. No accounts, no email addresses.
3. **Learn, then play.** The teacher presents a 5-minute lesson on the board (its quiz questions become class polls), then starts a class game: a robot tournament, a race, a flying car challenge or a math race.
4. **Talk about why.** Every game explains what happened, so the end of class is a conversation about the idea, not just the score.

## The lessons

Each lesson takes about 5 minutes and has something to try: a simulator, a quick experiment or a sorting game. The topics build on each other:

- **Sense, Think, Act:** what makes a machine a robot
- **Sensors:** how robots see, feel and measure distance, and what fools a distance sensor
- **Motors and gears:** DC motors, servos, steppers, and why gearing trades speed for pushing force
- **Robot arms:** links, joints, reach, and why far loads are harder to hold
- **Forces:** thrust, weight and landing, with a flying car
- **If-then rules:** the first step into programming a robot's brain

Every lesson ends by sending students into a game challenge that uses what they just learned.

## The games

- **Bot Arena:** students build a robot from parts that sense, think and act, then battle the class in a tournament on the board. Before each fight, the class predicts the winner.
- **Brain Challenges:** program a robot's brain with if-then rules and beat a series of boss robots.
- **Robot Racer:** pick a gear ratio and tires for each track's hills and corners, then race the clock. Race Day runs a Grand Prix for the whole class.
- **Flying Car Lab:** design a flying car from materials, air tanks and thrusters, and fly missions that teach thrust, weight and landing.
- **Speed Run:** a class math race about the Flying Car Lab's cars, with worked steps after every problem.

## Predict, test, explain, improve

Every mission works the same way. Students **predict** what will happen before they run it, **test** it, read an **explanation** of why it happened, and **improve** one thing at a time. In a class game, the board shows the teacher who predicted right on the first try and who improved by changing one thing at a time. That's the class's understanding, measured without a quiz.

## The story: Neo Harbor

Circuit Rebels wraps the lessons in a story. In the year 2060, an AI called OMNI runs the city of Neo Harbor, and a crew of kids in the old subway tunnels learns how its machines really work. Each story mission is one class period with five steps: a briefing, a lesson, practice in a game, the mission itself, and a reward. Story mode is in development; its first finished mission (from Episode 5) is playable now on the story map.

## Privacy

Students can play without accounts: they join with a code and a first name. Classes that want progress saved across devices can turn on class accounts, where the teacher signs in with Google and students sign in with a class code, their name and 3 pictures. Circuit Rebels has no ads and never asks for student photos.
