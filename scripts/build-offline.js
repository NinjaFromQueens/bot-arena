// Builds single-file backups that open with a double-click, no internet or server needed:
//   offline/bot-arena-offline.html       practice mode (build robots, battle by bot code)
//   offline/flying-car-lab-offline.html  the Flying Car Lab
//   offline/robot-lessons-offline.html   the self-guided lessons
// Run: npm run offline
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), pub = path.join(root, "public"), out = path.join(root, "offline");
fs.mkdirSync(out, { recursive: true });
const read = (p) => fs.readFileSync(path.join(pub, p), "utf8");
const logo = "data:image/svg+xml;base64," + Buffer.from(read("img/logo.svg")).toString("base64");

function bundle(page, links) {
  let html = read(page).replace(/<script src="\/socket\.io\/socket\.io\.js"><\/script>\n?/g, ""); // no server offline
  // inline local scripts and the shared stylesheet
  html = html.replace(/<script src="\/js\/([\w-]+\.js)"><\/script>/g, (_m, f) => `<script>\n${read("js/" + f).replace(/<\/script/gi, "<\\/script")}\n</script>`);
  html = html.replace(/<link rel="stylesheet" href="\/css\/style\.css">/, () => `<style>\n${read("css/style.css")}\n</style>`);
  html = html.replace(/(href|src)="\/img\/logo\.svg"/g, `$1="${logo}"`);
  for (const [from, to] of Object.entries(links)) {
    html = html.split(`href="${from}"`).join(`href="${to}"`);
    html = html.split(`href: "${from}"`).join(`href: "${to}"`); // links inside lesson data
  }
  // Google Fonts load when online; offline the page falls back to Arial
  html = html.replace("<title>", "<!-- Offline backup of Bot Arena. Built by scripts/build-offline.js -->\n<title>");
  if (/(src|href)(="|: ")\/(?!\/)/.test(html)) throw new Error(page + " still has a server path: " + html.match(/(src|href)="\/[^"]*"/)[0]);
  return html;
}
fs.writeFileSync(path.join(out, "bot-arena-offline.html"), bundle("practice.html", { "/lab": "flying-car-lab-offline.html", "/": "bot-arena-offline.html" }));
fs.writeFileSync(path.join(out, "flying-car-lab-offline.html"), bundle("lab.html", { "/": "bot-arena-offline.html", "/learn": "robot-lessons-offline.html" }));
fs.writeFileSync(path.join(out, "robot-lessons-offline.html"), bundle("learn.html", { "/": "bot-arena-offline.html", "/practice": "bot-arena-offline.html", "/lab": "flying-car-lab-offline.html" }));
console.log("Built offline/bot-arena-offline.html, flying-car-lab-offline.html, robot-lessons-offline.html");
