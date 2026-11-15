// Builds a single-file app (no Node.js install needed) using Node's Single Executable Applications.
//   node scripts/build.mjs        -> dist/HTML-Lower-Thirds(.exe)
// Needs Node 22+ and internet access (downloads the "postject" tool via npx).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(root);
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);

// Everything the app serves or copies on first run is built into the executable
const assets = {};
for (const f of fs.readdirSync("public")) assets["public/" + f] = "public/" + f;
assets["lowerthirds.example.txt"] = "lowerthirds.example.txt";
assets["songs-example/Amazing Grace.txt"] = "songs-example/Amazing Grace.txt";

const blob = path.join(dist, "app.blob");
fs.writeFileSync(path.join(dist, "sea-config.json"), JSON.stringify({
  main: "server.js",
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets,
}, null, 2));

const run = (cmd, args) => { console.log("> " + [cmd, ...args].join(" ")); execFileSync(cmd, args, { stdio: "inherit", shell: isWin }); };

run(process.execPath, ["--experimental-sea-config", path.join(dist, "sea-config.json")]);

const exe = path.join(dist, "HTML-Lower-Thirds" + (isWin ? ".exe" : ""));
fs.copyFileSync(process.execPath, exe);
if (isMac) run("codesign", ["--remove-signature", exe]);

const postjectArgs = ["--yes", "postject@1.0.0-alpha.6", exe, "NODE_SEA_BLOB", blob,
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (isMac) postjectArgs.push("--macho-segment-name", "NODE_SEA");
run("npx", postjectArgs);
if (isMac) run("codesign", ["--sign", "-", exe]);

fs.rmSync(blob); fs.rmSync(path.join(dist, "sea-config.json"));
console.log("\nBuilt " + exe);
