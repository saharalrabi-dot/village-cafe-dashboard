// Fetches the game's analytics from Roblox Open Cloud and writes data/analytics.json.
// Runs every day from GitHub Actions (.github/workflows/update.yml).
// Needs: ROBLOX_API_KEY (an Open Cloud key with universe.analytics:read on this experience).
// Docs: https://create.roblox.com/docs/cloud/guides/analytics

import { readFile, writeFile, mkdir } from "node:fs/promises";

const UNIVERSE_ID = process.env.UNIVERSE_ID || "10769974806"; // "SURVIVE at the Village Cafe"
const API_KEY = process.env.ROBLOX_API_KEY;
const DAYS = 90; // history kept on the page
const BASE = "https://apis.roblox.com/analytics-query-api";
const OUT = new URL("../data/analytics.json", import.meta.url);

if (!API_KEY) {
  console.error("Missing ROBLOX_API_KEY. Add it under Settings → Secrets and variables → Actions.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function range(days) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0); // today 00:00 UTC (exclusive) → yesterday is the last full day
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function call(method, path, body) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/${path}`, {
      method,
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok && res.status !== 202) {
      throw new Error(`${res.status} ${json?.error?.message || json?.message || text.slice(0, 200)}`);
    }
    return json;
  }
  throw new Error("Roblox API kept failing (rate limit or server error)");
}

// one metric query; follows the long-running operation until it is done
async function metric(name, { granularity = "OneDay", breakdown, days = DAYS, filter } = {}) {
  const body = { metric: name, granularity, ...range(days) };
  if (breakdown) body.breakdown = breakdown;
  if (filter) body.filter = filter;
  let op = await call("POST", `v1/universes/${UNIVERSE_ID}/metrics`, body);
  for (let i = 0; i < 30 && op && op.done === false && op.path; i++) {
    await sleep(1500);
    op = await call("GET", op.path);
  }
  if (op?.error) throw new Error(`${op.error.code}: ${op.error.message}`);
  if (op?.done === false) throw new Error("timed out waiting for Roblox");
  const values = op?.response?.values || op?.values || [];
  return values.map((s) => ({
    key: (s.breakdowns || []).map((b) => b.displayValue || b.value).join(" · ") || "Total",
    points: (s.dataPoints || [])
      .filter((p) => p.value !== null && p.value !== undefined && p.value !== "")
      .map((p) => ({ t: String(p.time).slice(0, 10), v: Number(p.value) }))
      .filter((p) => Number.isFinite(p.v))
      .sort((a, b) => a.t.localeCompare(b.t)),
  }));
}

const total = (series) => (series.find((s) => s.key === "Total") || series[0] || { points: [] }).points;

const jobs = {
  dau: () => metric("DailyActiveUsers").then(total),
  dauByNew: () => metric("DailyActiveUsers", { breakdown: ["IsNewUser"] }),
  visits: () => metric("Visits").then(total),
  sessionMinutes: () => metric("AverageSessionLengthMinutes").then(total),
  playtimePerDau: () => metric("AveragePlayTimeMinutesPerDAU").then(total),
  playtimeHours: () => metric("TotalPlayTimeHours").then(total),
  d1: () => metric("ForwardD1Retention").then(total),
  d7: () => metric("ForwardD7Retention").then(total),
  d30: () => metric("ForwardD30Retention").then(total),
  stickiness: () => metric("DauMauStickiness").then(total),
  newPlayersBySource: () => metric("UniqueUsersWithPlaySessions", { breakdown: ["AcquisitionSource"] }),
  sources28: () => metric("UniqueUsersWithPlaySessions", { granularity: "None", breakdown: ["AcquisitionSource"], days: 28 }),
  d1BySource: () => metric("ForwardD1Retention", { granularity: "OneDay", breakdown: ["AcquisitionSource"], days: 28 }),
  impressionCtr: () => metric("ImpressionCVR").then(total),
  playRate: () => metric("EndToEndCVR").then(total),
  revenue: () => metric("DailyRevenue").then(total),
  payingUsers: () => metric("PayingUsers").then(total),
  platform28: () => metric("DailyActiveUsers", { granularity: "None", breakdown: ["Platform"], days: 28 }),
  country28: () => metric("DailyActiveUsers", { granularity: "None", breakdown: ["Country"], days: 28 }),
};

let previous = {};
try {
  previous = JSON.parse(await readFile(OUT, "utf8"));
} catch {}

const metrics = {};
const errors = {};
for (const [key, run] of Object.entries(jobs)) {
  try {
    metrics[key] = await run();
    console.log(`✓ ${key}`);
  } catch (e) {
    errors[key] = String(e.message || e);
    if (previous.metrics?.[key] !== undefined) metrics[key] = previous.metrics[key]; // keep yesterday's numbers
    console.warn(`✗ ${key}: ${errors[key]}`);
  }
  await sleep(300);
}

const okCount = Object.keys(jobs).length - Object.keys(errors).length;
if (okCount === 0) {
  console.error("No metric could be read — the page keeps its previous data. Check the API key and its permissions.");
  process.exit(1);
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ updatedAt: new Date().toISOString(), universeId: UNIVERSE_ID, days: DAYS, metrics, errors }, null, 1) + "\n"
);
console.log(`Saved ${okCount}/${Object.keys(jobs).length} metrics.`);
