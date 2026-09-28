// Opens every deck and every slide in headless Chromium and fails on any JavaScript error.
//
//   NODE_PATH=$(npm root -g) node paperverse/tools/check.js            # all decks
//   NODE_PATH=$(npm root -g) node paperverse/tools/check.js ncp mamba3 # only these, with screenshots
//
// Runs twice: a 1440px desktop window and an emulated iPhone 13 (390px wide, touch).
//
// Screenshots of the named decks go to paperverse/dist/shots/ (git-ignored).
const http = require("http");
const fs = require("fs");
const path = require("path");

let chromium, devices;
try { ({ chromium, devices } = require("playwright-core")); } catch (e) { ({ chromium, devices } = require("playwright")); }

const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

function chromePath() {
  const base = "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined; // let Playwright find its own browser
  const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  return dir ? path.join(base, dir, "chrome-linux", "chrome") : undefined;
}

(async () => {
  const only = process.argv.slice(2);
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const errors = [];
  let where = "home page";
  const shotDir = path.join(ROOT, "dist", "shots");
  // a desktop window, then an emulated phone (touch, high pixel density, mobile viewport)
  const setups = [{ viewport: { width: 1440, height: 900 } }, { ...devices["iPhone 13"], deviceScaleFactor: 2 }];
  for (const setup of setups) {
    const vp = setup.viewport;
    const context = await browser.newContext(setup);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`[${vp.width}px] ${where}: ${e.stack || e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(`[${vp.width}px] ${where}: console: ${m.text()}`); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const decks = await page.evaluate(() => PV.papers.map((p) => [p.id, p.slides.length + 2]));
    const missing = only.filter((id) => !decks.some(([d]) => d === id));
    if (missing.length) errors.push(`unknown deck id(s): ${missing.join(", ")}`);
    for (const [id, n] of decks) {
      if (only.length && !only.includes(id)) continue;
      for (let s = 0; s < n; s++) {
        where = `deck \"${id}\" slide ${s + 1}`;
        await page.evaluate(([i, k]) => PV.openDeck(i, k), [id, s]);
        await page.waitForTimeout(only.length ? 1400 : 200);
        if (only.length) {
          fs.mkdirSync(shotDir, { recursive: true });
          await page.screenshot({ path: path.join(shotDir, `${id}-${s + 1}-${vp.width}.png`) });
        }
      }
      await page.evaluate(() => PV.closeDeck());
      where = `after closing \"${id}\"`;
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) errors.push(`[${vp.width}px] page scrolls sideways by ${overflow}px`);
    console.log(`${vp.width}px: ${decks.length} decks, ${decks.reduce((a, d) => a + d[1], 0)} slides checked`);
    await context.close();
  }
  await browser.close();
  server.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("NO ERRORS" + (only.length ? `. Screenshots in ${path.relative(process.cwd(), shotDir)}/` : ""));
})();
