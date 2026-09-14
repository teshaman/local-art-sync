#!/usr/bin/env node
/**
 * Local Art Sync watcher — uploads new files from a local folder to The Forge assets library
 * (or copies them into a local Foundry Data folder) and records the resulting URLs in
 * manifest.json next to the files, so Claude Code, Codex/ChatGPT and macros can look them up.
 *
 * Category subfolders: a file saved in <folder>/npcs/ is uploaded to <dest>/npcs/, one in
 * <folder>/items/ to <dest>/items/, and so on. Files dropped in the root of <folder> go to
 * <dest>/inbox/. The standard category folders are created on start so they can be used at once.
 *
 * Usage:
 *   node watch.mjs --folder "C:/path/to/art" [--dest art] [--once] [--interval 5]
 *   node watch.mjs --folder "C:/path/to/art" --local-data "C:/Users/me/AppData/Local/FoundryVTT/Data" [--dest art]
 *   node watch.mjs --folder "C:/path/to/art" --list
 *
 * Forge mode needs an API key: set FORGE_API_KEY (My Account -> API Manager on forge-vtt.com), or pass --api-key.
 * Zero dependencies; Node 20+.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FORGE_URL = process.env.FORGE_URL || "https://forge-vtt.com";
const MEDIA = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp", "mp3", "ogg", "wav", "webm", "mp4", "m4a", "flac"]);
const MANIFEST = "manifest.json";
/** Standard category folders (mirrored in the module's inbox-app.mjs). "inbox" is the uncategorised drop. */
const CATEGORIES = ["inbox", "npcs", "tokens", "portraits", "items", "feats", "spells", "classes", "backgrounds", "scenes", "journals", "locations", "factions", "misc"];

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.folder) {
  console.log("Usage: node watch.mjs --folder <dir> [--dest art] [--local-data <FoundryData>] [--api-key <key>] [--interval 5] [--once] [--list] [--no-folders]");
  process.exit(args.help ? 0 : 1);
}
const folder = path.resolve(args.folder);
// Destination ROOT in the assets library; a legacy "art/inbox" value is treated as root "art".
const dest = String(args.dest || "art").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/inbox$/, "");
const localData = args["local-data"] ? path.resolve(args["local-data"]) : null;
const apiKey = args["api-key"] || process.env.FORGE_API_KEY || "";
const intervalMs = Math.max(2, Number(args.interval) || 5) * 1000;
const manifestPath = path.join(folder, MANIFEST);

if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) fail(`folder not found: ${folder}`);
if (!localData && !apiKey) fail("Forge mode needs FORGE_API_KEY (or --api-key). For a local Foundry use --local-data <Data folder>.");
if (localData && !fs.existsSync(localData)) fail(`local data folder not found: ${localData}`);

const manifest = readManifest();
if (args.list) {
  for (const [key, e] of Object.entries(manifest)) console.log(`${key}\t${e.url}`);
  process.exit(0);
}
if (!args["no-folders"]) for (const c of CATEGORIES) fs.mkdirSync(path.join(folder, c), { recursive: true });

log(`watching ${folder} (categories: ${CATEGORIES.join(", ")})`);
log(localData ? `mode: local Foundry -> ${path.join(localData, dest)}/<category>` : `mode: The Forge assets library -> ${dest}/<category>`);

let running = false, again = false;
async function sync() {
  if (running) { again = true; return; }
  running = true;
  try {
    for (const f of walk()) {
      const prev = manifest[f.key];
      if (prev && prev.size === f.stat.size && prev.mtimeMs === f.stat.mtimeMs) continue;
      if (Date.now() - f.stat.mtimeMs < 1500) { again = true; continue; }   // still being written
      try {
        const url = localData ? copyLocal(f) : await uploadForge(f);
        manifest[f.key] = { url, category: f.category, size: f.stat.size, mtimeMs: f.stat.mtimeMs, uploadedAt: new Date().toISOString() };
        writeManifest();
        log(`uploaded ${f.key}\n           ${url}`);
      } catch (err) {
        log(`FAILED ${f.key}: ${err.message}`);
      }
    }
  } finally {
    running = false;
    if (again) { again = false; setTimeout(sync, 1500); }
  }
}

await sync();
if (args.once) process.exit(0);
try { fs.watch(folder, { persistent: true, recursive: true }, () => { again = true; setTimeout(sync, 800); }); } catch { /* polling below covers it */ }
setInterval(sync, intervalMs);

/* ---------------------------------------------------------------- files */

/** Media files in the root (category "inbox") and one level of subfolders (category = folder name). */
function* walk() {
  for (const entry of listDir(folder)) {
    if (entry.stat.isDirectory()) {
      const category = entry.name.toLowerCase();
      for (const sub of listDir(entry.full)) {
        if (sub.stat.isFile() && isMedia(sub.name)) yield { ...sub, category, key: `${entry.name}/${sub.name}` };
      }
    } else if (entry.stat.isFile() && isMedia(entry.name)) {
      yield { ...entry, category: "inbox", key: entry.name };
    }
  }
}
function listDir(dir) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === MANIFEST || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    try { out.push({ name, full, stat: fs.statSync(full) }); } catch { /* vanished */ }
  }
  return out;
}
function isMedia(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return MEDIA.has(ext);
}

/* ---------------------------------------------------------------- upload */

async function uploadForge(f) {
  const dir = `${dest}/${f.category}`;
  const form = new FormData();
  form.append("path", `${dir}/${f.name}`);
  form.append("file", new Blob([fs.readFileSync(f.full)], { type: mimeOf(f.name) }), f.name);
  const res = await fetch(`${FORGE_URL}/api/assets/upload`, { method: "POST", headers: { "Access-Key": apiKey }, body: form });
  let body = null;
  try { body = await res.json(); } catch { /* not json */ }
  if (!res.ok || body?.error) throw new Error(`Forge API ${res.status}: ${body?.error ?? res.statusText}`);
  if (body?.url) return body.url;
  // Fall back to browsing the destination folder for the file's URL
  const browse = await fetch(`${FORGE_URL}/api/assets/browse`, {
    method: "POST", headers: { "Access-Key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ path: dir })
  });
  const listing = await browse.json().catch(() => null);
  const hit = (listing?.files ?? []).find(x => decodeURIComponent(String(x.url ?? x).split("/").pop()) === f.name);
  if (!hit) throw new Error("uploaded, but the file's URL was not returned; check the assets library");
  return hit.url ?? hit;
}

function copyLocal(f) {
  const dir = path.join(localData, dest, f.category);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(f.full, path.join(dir, f.name));
  return `${dest}/${f.category}/${f.name}`;
}

/* ---------------------------------------------------------------- helpers */

function readManifest() {
  try { return JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { return {}; }
}
function writeManifest() {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
function mimeOf(name) {
  const ext = name.split(".").pop().toLowerCase();
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", webm: "video/webm", mp4: "video/mp4", m4a: "audio/mp4", flac: "audio/flac" }[ext] ?? "application/octet-stream";
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
function log(msg) { console.log(`[art-sync ${new Date().toLocaleTimeString()}] ${msg}`); }
function fail(msg) { console.error(`[art-sync] ${msg}`); process.exit(1); }
