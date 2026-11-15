// Collects the live join/leave events the game sends to ntfy and appends them to data/live.json.
// ntfy keeps messages for ~12 hours, so this runs every 30 minutes (.github/workflows/live.yml).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const TOPIC = process.env.NTFY_TOPIC || "villagecafe-f93b3774fd6d00f6"; // same topic as ServerScriptService.LiveStats
const OUT = new URL("../data/live.json", import.meta.url);
const KEEP_DAYS = 90;

let old = { events: [] };
try { old = JSON.parse(await readFile(OUT, "utf8")); } catch {}

const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=all`);
if (!res.ok) { console.error("ntfy answered", res.status); process.exit(1); }
const text = await res.text();

const seen = new Set((old.events || []).map((e) => e.id));
const events = [...(old.events || [])];
let added = 0;
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  let m; try { m = JSON.parse(line); } catch { continue; }
  if (m.event !== "message" || !Array.isArray(m.tags) || seen.has(m.id)) continue;
  const tag = (p) => { const t = m.tags.find((x) => x.startsWith(p + ":")); return t ? t.slice(p.length + 1) : null; };
  const kind = m.tags.includes("join") ? "join" : m.tags.includes("leave") ? "leave" : null;
  if (!kind) continue;
  const e = { id: m.id, t: m.time, kind, h: tag("h"), lv: Number(tag("lv")) || 1, n: Number(tag("n")) || 0, on: Number(tag("on")) || 0 };
  if (kind === "join") e.isNew = m.tags.includes("new");
  if (kind === "leave") e.s = Number(tag("s")) || 0;
  events.push(e); seen.add(m.id); added++;
}
const cutoff = Date.now() / 1000 - KEEP_DAYS * 86400;
const kept = events.filter((e) => e.t >= cutoff).sort((a, b) => a.t - b.t);
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), events: kept }, null, 1) + "\n");
console.log(`+${added} events, ${kept.length} kept`);
