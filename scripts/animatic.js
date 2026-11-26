#!/usr/bin/env node
/* Watch a draft episode's animatic on this computer (EP1-3): starts the server with STORY_DRAFTS set to a private draft
 * folder (lib/drafts.js), then open http://localhost:3000/animatic.
 *
 *   npm run animatic                      Episode 1's draft (../bot-arena-v2/art-work/story/ep1)
 *   npm run animatic -- <draft folder>    another draft
 */
const path = require("path"), fs = require("fs");
const dir = path.resolve(__dirname, "..", process.argv[2] || "../bot-arena-v2/art-work/story/ep1");
if (!fs.existsSync(path.join(dir, "draft.json"))) { console.error(`No draft.json in ${dir}. Pass the draft folder: npm run animatic -- <folder>`); process.exit(2); }
process.env.STORY_DRAFTS = dir;
require("../server.js");
console.log(`Open http://localhost:${process.env.PORT || 3000}/animatic (Chrome reads the lines aloud once you press Play)`);
