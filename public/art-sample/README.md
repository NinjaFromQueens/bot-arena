# Robot art packs

Bot Arena draws every robot part in code. An **art pack** swaps any part for a picture: a body (Wheels, Treads, Legs, Wedge), a sensor head, or a tool. The robot's torso, colors, battle scars, shield and all the animation stay the same, so a picture of a hammer still swings, a spinner picture still spins, and a flipper still snaps up.

## Try the sample pack

1. Copy everything in this folder (`manifest.json` and the `.svg` files) into a new folder `public/art/`.
2. Reload the board, the student pages and practice mode. Robots with Wheels, the Camera, the Ultrasonic sensor or the Hammer now use the pictures; every other part is still drawn in code.
3. To turn it off, delete `public/art/`.

## Make your own

Put the pictures in `public/art/` and list them in `public/art/manifest.json`:

```json
{
  "name": "Our class parts",
  "parts": {
    "body.1": { "src": "treads.png", "box": [-1.05, -0.6, 2.1, 0.6] },
    "sensor.3": { "src": "lidar-head.png", "box": [-0.48, -0.42, 0.96, 0.78], "tint": true },
    "tool.2": { "src": "saw.png", "box": [0, -0.36, 0.72, 0.72], "pivot": [0.36, 0] }
  }
}
```

- **Keys** are `slot.number`, with numbers in the order the builder shows them: `body.0` Wheels, `body.1` Treads, `body.2` Legs, `body.3` Wedge; `sensor.0` Camera, `sensor.1` Ultrasonic, `sensor.2` Touch, `sensor.3` Lidar; `tool.0` Gripper, `tool.1` Hammer, `tool.2` Spinner, `tool.3` Flipper, `tool.4` Drill.
- **box** is `[x, y, width, height]` in robot sizes (the robot's torso is 1.3 wide and 0.95 tall). Each slot has its own starting point:
  - **body:** the ground under the middle of the robot. Up is negative y, so a body 0.6 tall sitting on the ground is `y: -0.6, height: 0.6`. The robot faces right.
  - **sensor:** the middle of the head. The coded head is about 0.82 wide and 0.56 tall.
  - **tool:** the hand, with the tool pointing right along the arm. Put the end that's held at the left edge, halfway down (`y` is minus half the height).
- **tint** (optional): draw the picture in grays and it's colored with the robot's color (light grays take the most color; black stays black).
- **pivot** (optional, spinners): the point the picture spins around, in the same units as the box. It defaults to the middle of the box.
- Pictures should have **see-through backgrounds** (PNG or SVG), face **right**, and be about 200 to 600 pixels wide.

Art from Higgsfield or Canva works the same way: export a transparent PNG for each part, crop it tight, and add a line to the manifest. Check the result in practice mode before class.

## Students' own pictures

In practice mode, the Build tab has **Your own part pictures**: a student can upload a photo of a drawing for their robot's body, sensor or tool. Those pictures stay on that device and only show in practice mode. They never go to the class's board.
