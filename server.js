// HTML Lower Thirds — lower thirds and song lyrics for OBS.
// Runs as a single packaged app (HTML-Lower-Thirds.exe) or from source with Node.js 18+:  node server.js
// Overlay (OBS Browser Source):  http://localhost:3000/overlay.html
// Control panel (any device on your network):  http://<this-PC-IP>:3000/

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

// ---------- packaged app or source? ----------
let sea = null;
try { sea = require("node:sea"); if (!sea.isSea()) sea = null; } catch { sea = null; }
const IS_PACKAGED = !!sea;

// Files that ship with the app (pages, examples). Packaged: built into the .exe. Source: next to server.js.
function readAsset(rel) {
  if (IS_PACKAGED) return Buffer.from(sea.getAsset(rel.replace(/\\/g, "/")));
  return fs.readFileSync(path.join(__dirname, rel));
}
function loadModuleAsset(rel) {
  const m = { exports: {} };
  new Function("module", "exports", readAsset(rel).toString("utf8"))(m, m.exports);
  return m.exports;
}

// ---------- where your files live: Documents\HTML Lower Thirds ----------
function documentsFolder() {
  if (process.platform === "win32") {
    // Respect a moved Documents folder (for example OneDrive\Documents)
    try {
      const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal',
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      const m = out.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/);
      if (m) {
        const p = m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] || "");
        if (fs.existsSync(p)) return p;
      }
    } catch {}
  } else {
    try {
      const p = execSync("xdg-user-dir DOCUMENTS", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (p && p !== os.homedir() && fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(os.homedir(), "Documents");
}
function findDataDir() {
  if (process.env.LT_DATA_DIR) return process.env.LT_DATA_DIR;
  const docs = path.join(documentsFolder(), "HTML Lower Thirds");
  if (fs.existsSync(docs)) return docs;
  // On a computer whose Documents folder isn't in OneDrive, use the folder that
  // OneDrive synced from another computer, so settings, services and lists match
  for (const od of [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]) {
    if (!od) continue;
    const synced = path.join(od, "Documents", "HTML Lower Thirds");
    if (fs.existsSync(path.join(synced, "config.json"))) return synced;
  }
  return docs;
}
const DATA_DIR = path.resolve(findDataDir());
fs.mkdirSync(path.join(DATA_DIR, "Services"), { recursive: true });

// Paths in config.json may use %OneDrive%, %USERPROFILE%, ~ etc.; relative paths are inside DATA_DIR
function expandPath(p) {
  if (!p) return p;
  let s = String(p).replace(/%([^%]+)%/g, (all, v) => process.env[v] ?? process.env[v.toUpperCase()] ?? all)
    .replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (all, v) => process.env[v] ?? all);
  if (s === "~" || s.startsWith("~/") || s.startsWith("~\\")) s = path.join(os.homedir(), s.slice(1));
  return path.resolve(DATA_DIR, s);
}

const TEMPLATES = loadModuleAsset("public/templates.js");

let PORT = Number(process.env.PORT) || 3000; // can also be set with "port" in config.json
const PRESETS_FILE = path.join(DATA_DIR, "presets.json");
// Settings from config.json (see config.example.json)
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
let config = {};
let configError = "";
// First run: write a starter config.json people can edit
if (!fs.existsSync(CONFIG_FILE)) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      songFolders: ["Songs"],
      linesPerSlide: 2,
      openBrowser: true,
    }, null, 2));
  } catch {}
}
if (fs.existsSync(CONFIG_FILE)) {
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch (e) { configError = e.message; }
}

if (!process.env.PORT && Number(config.port)) PORT = Number(config.port);

// Text file to read lower thirds from. First match wins:
//   node server.js "C:\path\to\file.txt"  >  DATA_FILE env  >  "lowerThirdsFile" in config.json  >  ./lowerthirds.txt
const DEFAULT_DATA_FILE = path.join(DATA_DIR, "Services", "Service order.txt");
let DATA_FILE = expandPath(process.argv[2] || process.env.DATA_FILE || config.lowerThirdsFile || DEFAULT_DATA_FILE);

let state = { visible: false, template: null, fields: {}, autoHide: 0, ts: Date.now() };
let hideTimer = null;
const clients = new Set();

// ---------- rundown from text file ----------
let rundown = { file: DATA_FILE, items: [], pos: -1, errors: [], loaded: null };

// Lines in the file:
//   speaker | Name | Title        -> a lower third
//   song | 1003                  -> a song, expanded into its lyric slides (number, file name or title)
function resolveSong(ref) {
  const r = ref.trim().toLowerCase();
  if (!r) return { error: "no song given" };
  const L = songs.list;
  const exact = L.find((s) => s.id.toLowerCase() === r) || L.find((s) => s.name.toLowerCase() === r);
  if (exact) return { song: exact };
  for (const test of [(n) => n.startsWith(r + " -") || n.startsWith(r + " "), (n) => n.includes(r)]) {
    const m = L.filter((s) => test(s.name.toLowerCase()));
    if (m.length === 1) return { song: m[0] };
    if (m.length > 1) return { error: `"${ref}" matches ${m.length} songs (${m.slice(0, 3).map((s) => s.name).join(", ")}…)` };
  }
  return { error: `song "${ref}" not found` };
}

function parseRundown(text) {
  const items = [], errors = [], songIds = [];
  text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = line.split(/\s*[|\t]\s*/);
    let template = cols.shift().toLowerCase();
    if (template === "song" || template === "hymn") {
      const { song, error } = resolveSong(cols.join(" "));
      if (error) { errors.push(`Line ${i + 1}: ${error}`); return; }
      let parsed;
      try { parsed = parseSong(fs.readFileSync(songFiles[song.id], "utf8")); }
      catch { errors.push(`Line ${i + 1}: can't read "${song.name}"`); return; }
      if (!parsed.slides.length) { errors.push(`Line ${i + 1}: "${song.name}" has no lyrics`); return; }
      songIds.push(song.id);
      const title = parsed.title || song.name;
      parsed.slides.forEach((sl, n) => items.push({
        kind: "lyric", line: i + 1, songId: song.id, song: title, slide: n, label: sl.label, text: sl.text,
      }));
      return;
    }
    if (template === "speaker") template = "person";
    const t = TEMPLATES[template];
    if (!t) { errors.push(`Line ${i + 1}: unknown type "${template}"`); return; }
    const fields = {};
    t.fields.forEach((f, n) => { fields[f.key] = (cols[n] || "").trim(); });
    items.push({ kind: "lower", line: i + 1, template, fields });
  });
  return { items, errors, songIds };
}

function loadRundown() {
  try {
    const { items, errors, songIds } = parseRundown(fs.readFileSync(DATA_FILE, "utf8"));
    rundown = { ...rundown, items, errors, songIds, loaded: Date.now(), missing: false };
    if (rundown.pos >= items.length) rundown.pos = items.length - 1;
  } catch {
    rundown = { ...rundown, items: [], errors: [], songIds: [], missing: true, pos: -1 };
  }
  broadcast("rundown", rundown);
}

function showRundownItem(i, autoHide) {
  const item = rundown.items[i];
  if (!item) return false;
  rundown.pos = i;
  if (item.kind === "lyric") show("lyrics", { text: item.text, label: item.label, song: item.song });
  else show(item.template, item.fields, autoHide);
  broadcast("rundown", rundown);
  return true;
}

// First run: create the file from the example so there's something to try
if (!fs.existsSync(DATA_FILE) && DATA_FILE === DEFAULT_DATA_FILE) {
  try { fs.writeFileSync(DATA_FILE, readAsset("lowerthirds.example.txt")); } catch {}
}
fs.watchFile(DATA_FILE, { interval: 500 }, loadRundown);

// Switch to another lower thirds file while running (used by the control panel's Browse button)
function setDataFile(file) {
  const resolved = path.resolve(file);
  let st;
  try { st = fs.statSync(resolved); } catch { return "File not found"; }
  if (!st.isFile() || !resolved.toLowerCase().endsWith(".txt")) return "Choose a .txt file";
  fs.unwatchFile(DATA_FILE, loadRundown);
  DATA_FILE = resolved;
  rundown = { ...rundown, file: DATA_FILE, pos: -1 };
  fs.watchFile(DATA_FILE, { interval: 500 }, loadRundown);
  loadRundown();
  saveConfig({ lowerThirdsFile: DATA_FILE });
  console.log(`  Now reading lower thirds from: ${DATA_FILE}`);
  return "";
}

// Remember a setting in config.json, keeping everything else in it
function saveConfig(changes) {
  if (configError) return; // never overwrite a config.json we couldn't read
  config = { ...config, ...changes };
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch {}
}

// List folders and .txt files on this computer for the file browser
function browse(dir) {
  const isWin = process.platform === "win32";
  if (!dir) {
    if (isWin) {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const d = String.fromCharCode(c) + ":\\";
        try { fs.accessSync(d); drives.push({ name: d, path: d, type: "dir" }); } catch {}
      }
      return { dir: "", parent: null, entries: drives };
    }
    dir = "/";
  }
  dir = path.resolve(dir);
  const root = path.parse(dir).root;
  const parent = dir === root ? (isWin ? "" : null) : path.dirname(dir);
  const entries = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name.startsWith("$")) continue;
    const full = path.join(dir, e.name);
    let isDir = e.isDirectory(), isFile = e.isFile();
    if (e.isSymbolicLink()) { try { const st = fs.statSync(full); isDir = st.isDirectory(); isFile = st.isFile(); } catch { continue; } }
    if (isDir) entries.push({ name: e.name, path: full, type: "dir" });
    else if (isFile && e.name.toLowerCase().endsWith(".txt")) entries.push({ name: e.name, path: full, type: "file" });
  }
  const sort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return { dir, parent, entries: [...entries.filter((e) => e.type === "dir").sort(sort), ...entries.filter((e) => e.type === "file").sort(sort)] };
}

// ---------- song lyrics ----------
// Songs are .txt files in one or more folders (set in config.json, default ./songs).
// Sections start with a label line like [Verse], [Chorus], [Bridge]; a [Title] section
// names the song and is shown as its first slide. A blank line also starts a new section.
// Each section is split into slides of `linesPerSlide` lines. Lines starting with # are ignored.
const DEFAULT_SONGS_DIR = path.join(DATA_DIR, "Songs");

// "songSources": folders (for example on OneDrive) whose song files are copied into
// Documents\HTML Lower Thirds\Songs\<folder name>, so the app has its own copy that
// works even when OneDrive is offline. New and changed files are copied on start,
// every few minutes, and from the Lyrics tab's "Update songs" button.
const SONG_SOURCES = (Array.isArray(config.songSources) ? config.songSources : []).map(expandPath);
const sourceCopyDir = (src) => path.join(DEFAULT_SONGS_DIR, path.basename(src));
let lastSync = { at: null, copied: 0, sources: [] };

let syncing = null;
// Copies new and changed song files. Runs in the background: on a new computer OneDrive may
// need to download each file first, which can take a while for a whole hymnbook.
function syncSongs() {
  if (syncing) return syncing;
  syncing = (async () => {
    let copied = 0;
    const sources = [];
    for (const src of SONG_SOURCES) {
      const dest = sourceCopyDir(src);
      let files;
      try { files = (await fs.promises.readdir(src)).filter((f) => f.toLowerCase().endsWith(".txt")); }
      catch { sources.push({ folder: src, ok: false, files: 0 }); continue; } // offline or not signed in: keep using the copies
      await fs.promises.mkdir(dest, { recursive: true });
      for (const f of files) {
        const from = path.join(src, f), to = path.join(dest, f);
        try {
          const a = await fs.promises.stat(from);
          const b = await fs.promises.stat(to).catch(() => null);
          if (!b || b.size !== a.size || a.mtimeMs > b.mtimeMs + 1000) {
            await fs.promises.copyFile(from, to);
            await fs.promises.utimes(to, a.atime, a.mtime);
            copied++;
          }
        } catch {}
      }
      sources.push({ folder: src, ok: true, files: files.length });
    }
    lastSync = { at: Date.now(), copied, sources };
    if (copied) console.log(`  Copied ${copied} new or changed song file(s) from your song sources.`);
    return lastSync;
  })().finally(() => { syncing = null; });
  return syncing;
}

// Where songs are read from: "songFolders" if set, otherwise the copies of "songSources",
// otherwise the Songs folder
const SONG_DIRS = (Array.isArray(config.songFolders) && config.songFolders.length
  ? config.songFolders.map(expandPath)
  : SONG_SOURCES.length ? SONG_SOURCES.map(sourceCopyDir)
  : [process.env.SONGS_DIR ? expandPath(process.env.SONGS_DIR) : DEFAULT_SONGS_DIR]);
if (SONG_SOURCES.length) {
  for (const src of SONG_SOURCES) fs.mkdirSync(sourceCopyDir(src), { recursive: true });
  // First copy starts right after start-up (see server.listen); then every 5 minutes
  setInterval(() => syncSongs().then((r) => { if (r.copied) scanSongs(true); }), 5 * 60 * 1000);
}
const LINES_PER_SLIDE = Number(config.linesPerSlide) || 2;

let songs = { dirs: SONG_DIRS, list: [], current: null, title: "", slides: [], pos: -1, missing: [] };
let songsSig = "";
let songFiles = {}; // id -> full path

function parseSong(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => !l.trim().startsWith("#"));
  const sections = [];
  let cur = null;
  const startSection = (label) => { cur = { label, lines: [] }; sections.push(cur); };
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^\[(.*)\]$/);
    if (m) { startSection(m[1].trim()); continue; }
    if (!line) { if (cur && cur.lines.length) cur = null; continue; }
    if (!cur) startSection("");
    cur.lines.push(line);
  }
  let title = "";
  const counts = {}, totals = {};
  for (const sec of sections) if (sec.lines.length) totals[sec.label.toLowerCase()] = (totals[sec.label.toLowerCase()] || 0) + 1;
  const slides = [];
  for (const sec of sections) {
    if (!sec.lines.length) continue;
    const key = sec.label.toLowerCase();
    if (key === "title") {
      // The title is shown as the song's first slide
      title = sec.lines.join(" ");
      slides.push({ label: "Title", text: sec.lines.join("\n") });
      continue;
    }
    counts[key] = (counts[key] || 0) + 1;
    // Number repeated labels that aren't choruses: Verse 1, Verse 2, ...
    let label = sec.label;
    if (label && totals[key] > 1 && !/chorus|refrain/i.test(label)) label += " " + counts[key];
    for (let i = 0; i < sec.lines.length; i += LINES_PER_SLIDE) {
      const part = i === 0 ? label : (label ? label + " (cont.)" : "");
      slides.push({ label: part, text: sec.lines.slice(i, i + LINES_PER_SLIDE).join("\n") });
    }
  }
  return { title, slides };
}

function loadCurrentSong() {
  const file = songs.current && songFiles[songs.current];
  if (!file) { songs.current = null; songs.title = ""; songs.slides = []; songs.pos = -1; return; }
  try {
    const { title, slides } = parseSong(fs.readFileSync(file, "utf8"));
    songs.title = title || songs.current.split("/").pop();
    songs.slides = slides;
  } catch { songs.current = null; songs.slides = []; }
  if (songs.pos >= songs.slides.length) songs.pos = songs.slides.length - 1;
}

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function scanSongs(force) {
  const list = [], missing = [], sigParts = [];
  songFiles = {};
  for (const dir of SONG_DIRS) {
    const group = path.basename(dir);
    let files;
    try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); }
    catch { missing.push(dir); continue; }
    files.sort(naturalSort).forEach((f) => {
      const id = group + "/" + f.slice(0, -4);
      songFiles[id] = path.join(dir, f);
      list.push({ id, name: f.slice(0, -4), group });
      if (id === songs.current || (rundown.songIds || []).includes(id)) {
        try { sigParts.push(id + ":" + fs.statSync(songFiles[id]).mtimeMs); } catch {}
      }
    });
  }
  const sig = list.map((s) => s.id).join("|") + "#" + sigParts.join() + "#" + missing.join();
  if (!force && sig === songsSig) return;
  songsSig = sig;
  songs.list = list;
  songs.missing = missing;
  loadCurrentSong();
  broadcast("songs", songs);
  loadRundown(); // song list or a song in the service order changed
}

function selectSong(id) {
  const key = String(id || "").toLowerCase();
  const match = songs.list.find((s) => s.id.toLowerCase() === key)
    || songs.list.find((s) => s.name.toLowerCase() === key);
  if (!match) return false;
  songs.current = match.id; songs.pos = -1;
  loadCurrentSong();
  songsSig = ""; // force the next scan to track this song's edits
  broadcast("songs", songs);
  return true;
}

function showSlide(i) {
  const slide = songs.slides[i];
  if (!slide) return false;
  songs.pos = i;
  show("lyrics", { text: slide.text, label: slide.label, song: songs.title });
  broadcast("songs", songs);
  return true;
}

// First run with the default folder: create it with an example song
if (SONG_DIRS[0] === DEFAULT_SONGS_DIR && !fs.existsSync(DEFAULT_SONGS_DIR)) {
  try {
    fs.mkdirSync(DEFAULT_SONGS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEFAULT_SONGS_DIR, "Amazing Grace.txt"), readAsset("songs-example/Amazing Grace.txt"));
  } catch {}
}
setInterval(scanSongs, 2000); // picks up added, removed and edited song files

// ---------- presets (shared by every control panel) ----------
function loadPresets() {
  try { return JSON.parse(fs.readFileSync(PRESETS_FILE, "utf8")); }
  catch { return []; }
}
function savePresets(list) {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(list, null, 2));
}

// ---------- saved leadership lists (Leadership.txt) for the setup page ----------
// [Stake Leaders]
// President Hale | Stake President
//
// [Ward Leaders]
// Bishop Allen | Bishop
const PEOPLE_FILE = expandPath(config.leadershipFile || "Leadership.txt");
const PEOPLE_HEADER = [
  "# Leadership lists for the service order setup page.",
  "# Each [Section] is a list. One person per line:  Name | Title",
  "# Edit here or from the Setup tab; changes show up automatically.",
];
function parsePeople(text) {
  const groups = [];
  let cur = null;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\[(.*)\]$/);
    if (m) { cur = { name: m[1].trim() || "List", people: [] }; groups.push(cur); continue; }
    if (!cur) { cur = { name: "People", people: [] }; groups.push(cur); }
    const [name, ...rest] = line.split(/\s*\|\s*/);
    cur.people.push({ name: name.trim(), title: rest.join(" ").trim() });
  }
  return { groups };
}
function serializePeople(data) {
  const out = PEOPLE_HEADER.slice();
  for (const g of data.groups) {
    out.push("", `[${g.name}]`);
    for (const p of g.people) out.push(p.title ? `${p.name} | ${p.title}` : p.name);
  }
  return out.join(process.platform === "win32" ? "\r\n" : "\n") + (process.platform === "win32" ? "\r\n" : "\n");
}
function loadPeople() {
  try { return parsePeople(fs.readFileSync(PEOPLE_FILE, "utf8")); }
  catch { return { groups: [{ name: "Stake Leaders", people: [] }, { name: "Ward Leaders", people: [] }] }; }
}
if (!fs.existsSync(PEOPLE_FILE)) {
  try { fs.writeFileSync(PEOPLE_FILE, serializePeople(loadPeople())); } catch {}
}
fs.watchFile(PEOPLE_FILE, { interval: 1000 }, () => broadcast("people", loadPeople()));

// ---------- broadcasting ----------
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function show(template, fields, autoHide) {
  clearTimeout(hideTimer);
  state = { visible: true, template, fields: fields || {}, autoHide: Number(autoHide) || 0, ts: Date.now() };
  broadcast("state", state);
  if (state.autoHide > 0) hideTimer = setTimeout(hide, state.autoHide * 1000);
}

function hide() {
  clearTimeout(hideTimer);
  state = { ...state, visible: false, ts: Date.now() };
  broadcast("state", state);
}

// ---------- helpers ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
  });
}

function serveStatic(req, res, pathname) {
  if (pathname === "/") pathname = "/control.html";
  const rel = path.posix.normalize("public" + decodeURIComponent(pathname));
  if (!rel.startsWith("public/")) { res.writeHead(403); return res.end(); }
  let data;
  try { data = readAsset(rel); } catch { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(data);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  // Live event stream for overlays and control panels
  if (p === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`retry: 1000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
    res.write(`event: presets\ndata: ${JSON.stringify(loadPresets())}\n\n`);
    res.write(`event: rundown\ndata: ${JSON.stringify(rundown)}\n\n`);
    res.write(`event: songs\ndata: ${JSON.stringify(songs)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
  if (p === "/api/state") return sendJSON(res, 200, state);

  // POST /api/show  {template, fields, autoHide}
  // GET  /api/show?preset=Name   (handy for Stream Deck "Website" buttons)
  if (p === "/api/show") {
    if (req.method === "POST") {
      const b = await readBody(req);
      if (!b.template) return sendJSON(res, 400, { error: "template required" });
      show(b.template, b.fields, b.autoHide);
      return sendJSON(res, 200, state);
    }
    const name = url.searchParams.get("preset");
    const preset = loadPresets().find((x) => x.name.toLowerCase() === (name || "").toLowerCase());
    if (!preset) return sendJSON(res, 404, { error: "preset not found" });
    show(preset.template, preset.fields, url.searchParams.get("autoHide") ?? preset.autoHide);
    return sendJSON(res, 200, state);
  }

  if (p === "/api/hide") { hide(); return sendJSON(res, 200, state); }

  // Text-file rundown.  GET or POST:
  //   /api/rundown            -> list
  //   /api/rundown/show?i=2   -> show item 2 (0-based)
  //   /api/next, /api/prev    -> step through the file in order
  //   /api/rundown/reload     -> re-read the file now
  // Song lyrics.  GET or POST:
  //   /api/songs                       -> song list + current song's slides
  //   /api/lyrics/song?name=Folder/Song -> pick a song (just the file name works too)
  //   /api/lyrics/show?i=0             -> show slide i (0-based)
  //   /api/lyrics/next, /api/lyrics/prev
  if (p === "/api/songs") return sendJSON(res, 200, { ...songs, sync: lastSync, hasSources: SONG_SOURCES.length > 0 });
  // POST /api/songs/sync -> copy new and changed songs from "songSources" now
  if (p === "/api/songs/sync") {
    const r = await syncSongs();
    scanSongs(true);
    return sendJSON(res, 200, r);
  }
  if (p.startsWith("/api/lyrics/")) {
    const b = req.method === "POST" ? await readBody(req) : {};
    const q = (k) => b[k] ?? url.searchParams.get(k);
    let ok;
    if (p === "/api/lyrics/song") ok = selectSong(q("name"));
    else if (p === "/api/lyrics/show") ok = showSlide(Number(q("i")));
    else if (p === "/api/lyrics/next") ok = showSlide(songs.pos + 1);
    else if (p === "/api/lyrics/prev") ok = showSlide(Math.max(0, songs.pos - 1));
    else return sendJSON(res, 404, { error: "unknown lyrics command" });
    return ok ? sendJSON(res, 200, songs) : sendJSON(res, 404, { error: "no such song or slide" });
  }

  // File browser:  GET /api/browse?dir=C:\some\folder   (no dir = the current file's folder)
  if (p === "/api/browse") {
    const dir = url.searchParams.has("dir") ? url.searchParams.get("dir") : path.dirname(DATA_FILE);
    try { return sendJSON(res, 200, browse(dir)); }
    catch (e) { return sendJSON(res, 400, { error: "Can't open that folder (" + (e.code || e.message) + ")" }); }
  }
  // POST /api/rundown/file {path}  -> switch to another lower thirds file now
  if (p === "/api/rundown/file" && req.method === "POST") {
    const b = await readBody(req);
    const err = setDataFile(String(b.path || ""));
    return err ? sendJSON(res, 400, { error: err }) : sendJSON(res, 200, rundown);
  }

  // Leadership lists (Leadership.txt):  GET /api/people,  POST /api/people {groups:[{name, people:[{name,title}]}]}
  if (p === "/api/people") {
    if (req.method !== "POST") return sendJSON(res, 200, loadPeople());
    const b = await readBody(req);
    if (!Array.isArray(b.groups)) return sendJSON(res, 400, { error: "expected groups" });
    const clean = { groups: b.groups.map((g) => ({
      name: String(g.name || "").trim() || "List",
      people: (Array.isArray(g.people) ? g.people : []).map((x) => ({ name: String(x.name || "").trim(), title: String(x.title || "").trim() }))
        .filter((x) => x.name || x.title),
    })) };
    try { fs.writeFileSync(PEOPLE_FILE, serializePeople(clean)); }
    catch (e) { return sendJSON(res, 500, { error: "Couldn't save (" + (e.code || e.message) + ")" }); }
    broadcast("people", clean);
    return sendJSON(res, 200, clean);
  }

  // Service order builder (setup.html)
  //   GET  /api/servicefile                      -> { file, folder, text }
  //   POST /api/servicefile { text }             -> overwrite the current file
  //   POST /api/servicefile { text, newName, folder } -> create a new file (in folder, or next to
  //                                                      the current one) and switch to it
  if (p === "/api/servicefile") {
    if (req.method !== "POST") {
      let text = "";
      try { text = fs.readFileSync(DATA_FILE, "utf8").replace(/^\uFEFF/, ""); } catch {}
      const saved = config.serviceFolder && expandPath(config.serviceFolder);
      const folder = saved && fs.existsSync(saved) ? saved : path.join(DATA_DIR, "Services");
      return sendJSON(res, 200, { file: DATA_FILE, folder, text });
    }
    const b = await readBody(req);
    if (typeof b.text !== "string") return sendJSON(res, 400, { error: "No text to save" });
    const body = b.text.replace(/\r?\n/g, process.platform === "win32" ? "\r\n" : "\n");
    let target = DATA_FILE;
    if (b.newName) {
      const name = String(b.newName).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().replace(/\.txt$/i, "");
      if (!name) return sendJSON(res, 400, { error: "Enter a file name" });
      let folder = path.dirname(DATA_FILE);
      if (b.folder) {
        folder = path.resolve(String(b.folder));
        try { if (!fs.statSync(folder).isDirectory()) throw 0; }
        catch { return sendJSON(res, 400, { error: "That folder doesn't exist" }); }
        saveConfig({ serviceFolder: folder }); // remember it for next time
      }
      target = path.join(folder, name + ".txt");
      if (fs.existsSync(target) && !b.overwrite) return sendJSON(res, 409, { error: `"${name}.txt" already exists`, exists: true });
    }
    try { fs.writeFileSync(target, body); }
    catch (e) { return sendJSON(res, 500, { error: "Couldn't save (" + (e.code || e.message) + ")" }); }
    if (target !== DATA_FILE) setDataFile(target); else loadRundown();
    return sendJSON(res, 200, { file: DATA_FILE });
  }

  if (p === "/api/rundown") return sendJSON(res, 200, rundown);
  if (p === "/api/rundown/reload") { loadRundown(); return sendJSON(res, 200, rundown); }
  if (p === "/api/rundown/show" || p === "/api/next" || p === "/api/prev") {
    const b = req.method === "POST" ? await readBody(req) : {};
    const autoHide = b.autoHide ?? url.searchParams.get("autoHide") ?? 0;
    let i;
    if (p === "/api/next") i = rundown.pos + 1;
    else if (p === "/api/prev") i = Math.max(0, rundown.pos - 1);
    else i = Number(b.i ?? url.searchParams.get("i"));
    if (!showRundownItem(i, autoHide)) return sendJSON(res, 404, { error: "no item at that position" });
    return sendJSON(res, 200, state);
  }

  if (p === "/api/presets") {
    if (req.method === "POST") {
      const list = await readBody(req);
      if (!Array.isArray(list)) return sendJSON(res, 400, { error: "expected array" });
      savePresets(list);
      broadcast("presets", list);
      return sendJSON(res, 200, list);
    }
    return sendJSON(res, 200, loadPresets());
  }

  serveStatic(req, res, p);
});

// Keep event streams alive through idle periods
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 20000);

scanSongs(true);   // songs first, so "song |" lines in the service order can be found
loadRundown();

// In the packaged app the window closes when the program ends, so wait for Enter first
function exitAfterKey(code) {
  if (!IS_PACKAGED || !process.stdin.isTTY) process.exit(code);
  console.error("  Press Enter to close this window.");
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(code));
}

function openInBrowser(url) {
  try {
    const child = process.platform === "win32"
      ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" });
    child.on("error", () => {}); // no browser available: just skip
    child.unref();
  } catch {}
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use: HTML Lower Thirds is probably already running.`);
    console.error(`  Close the other HTML Lower Thirds window (or end it in Task Manager), then start again.`);
    console.error(`  The control panel is at http://localhost:${PORT}/\n`);
  } else console.error(err);
  exitAfterKey(1);
});
process.title = "HTML Lower Thirds";

server.listen(PORT, "0.0.0.0", () => {
  // Network addresses, with the adapter name so virtual ones (Hyper-V, WSL, VPN) are easy to spot
  const nets = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((i) => i.family === "IPv4" && !i.internal).map((i) => ({ name, ip: i.address })));
  const line = (label, url, note = "") => console.log(`    ${label.padEnd(10)} ${url}${note ? "   (" + note + ")" : ""}`);

  console.log("\n  HTML Lower Thirds is running\n");
  console.log("  OVERLAY (OBS Browser Source, 1920x1080)");
  line("Local:", `http://localhost:${PORT}/overlay.html`);
  for (const n of nets) line("Network:", `http://${n.ip}:${PORT}/overlay.html`, n.name);
  console.log("\n  CONTROL PANEL");
  line("Local:", `http://localhost:${PORT}/`);
  for (const n of nets) line("Network:", `http://${n.ip}:${PORT}/`, n.name);
  if (!nets.length) console.log("    Network:   (no network connection found)");
  console.log("\n  SERVICE ORDER SETUP");
  line("Local:", `http://localhost:${PORT}/setup.html`);
  for (const n of nets) line("Network:", `http://${n.ip}:${PORT}/setup.html`, n.name);

  if (configError) console.log(`\n  WARNING: config.json could not be read (${configError}). Using defaults.\n  Check for missing commas, and use double backslashes (\\\\) in Windows paths.`);
  console.log(`\n  Lower thirds file: ${DATA_FILE}${fs.existsSync(DATA_FILE) ? "" : "   (FILE NOT FOUND)"}`);
  for (const d of SONG_DIRS) console.log(`  Songs folder:      ${d}${fs.existsSync(d) ? "" : "   (FOLDER NOT FOUND)"}`);
  for (const src of SONG_SOURCES) console.log(`  Songs copied from: ${src}${fs.existsSync(src) ? "" : "   (NOT AVAILABLE: using the copies already saved)"}`);
  if (SONG_SOURCES.length) {
    console.log("  Checking for new or changed songs in the background...");
    syncSongs().then((r) => { scanSongs(true); console.log(`  Songs up to date (${r.sources.filter((x) => x.ok).reduce((n, x) => n + x.files, 0)} in your song sources).`); });
  }
  console.log(`  Leadership file:   ${PEOPLE_FILE}`);
  console.log(`  Your files:        ${DATA_DIR}`);
  console.log("\n  Leave this window open while you use it. Close it (or press Ctrl+C) to stop.\n");
  // Open the control panel automatically (packaged app), unless "openBrowser": false in config.json
  if (config.openBrowser ?? IS_PACKAGED) openInBrowser(`http://localhost:${PORT}/`);
});
