// UI preview data: real open markets from Polymarket/ESPN, simulated picks and results.
// Writes to DATA_DIR (default ./data-demo). Never touches the chain or the live ./data.
import fs from "node:fs";
import path from "node:path";
import * as pm from "../lib/sources/polymarket";
import * as espn from "../lib/sources/espn";
import { PERSONAS } from "../lib/agents";
import { ensureForecasters } from "../lib/engine";
import { record, snapshot } from "../lib/credibility";
import type { Db, MarketRec } from "../lib/types";

const dir = path.resolve(process.env.DATA_DIR ?? "./data-demo");
if (dir === path.resolve("./data")) throw new Error("refusing to seed the live data dir");

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const norm = (p: number[]) => {
  const c = p.map((x) => Math.min(0.95, Math.max(0.05, x)));
  const s = c.reduce((a, b) => a + b, 0);
  return c.map((x) => x / s);
};
const BIAS: Record<string, number> = { quant: 0.03, contrarian: 0.18, form: 0.1, skeptic: 0.12, newsroom: 0.07 };
const WHY: Record<string, string> = {
  quant: "Market price is fair; nudged for base rates in this kind of race.",
  contrarian: "The favourite looks overbought after a one-day move with no news.",
  form: "Momentum and the last five results point the same way.",
  skeptic: "Status quo usually holds; the hype premium looks too big.",
  newsroom: "Fresh reporting this morning changes the picture slightly.",
};

const db: Db = { markets: {}, picks: [], forecasters: {}, cred: {}, memory: [], snapshots: [], paid: {} };
ensureForecasters(db);
db.forecasters["0x7d3f00000000000000000000000000000000000000000000000000000000c031"] = { id: "0x7d3f00000000000000000000000000000000000000000000000000000000c031", kind: "human", name: "0x7d3f…c031" };

const [rest, football] = await Promise.all([pm.discover(), espn.discover()]);
const open = [...football.filter((m) => m.ref.bookmaker).slice(0, 6), ...rest].slice(0, 22);
const now = Date.now();
const MIST = 1_000_000_000;

function addPicks(m: MarketRec, at: number) {
  const ref = Object.values(m.ref)[0] ?? m.outcomes.map(() => 1 / m.outcomes.length);
  for (const [src, p] of Object.entries(m.ref)) db.picks.push({ id: `${m.key}:source:${src}`, marketKey: m.key, forecaster: `source:${src}`, probs: p, placedAt: at });
  for (const persona of PERSONAS) {
    const b = BIAS[persona.slug];
    const probs = norm(ref.map((x) => x + (rnd() - 0.5) * 2 * b));
    const outcome = probs.indexOf(Math.max(...probs));
    const stake = 20_000_000;
    db.picks.push({
      id: `${m.key}:${persona.slug}`,
      marketKey: m.key,
      forecaster: `agent:${persona.slug}`,
      probs,
      outcome,
      stakeMist: String(stake),
      reasoning: WHY[persona.slug],
      lessonsUsed: persona.slug === "contrarian" && rnd() > 0.5 ? ["Fade a favourite only when its price moved 5+ pts in a day with no news."] : [],
      placedAt: at + 60_000,
      tx: "demo",
      ticketId: `0xdemo${m.key.replace(/\W/g, "")}${persona.slug}`,
    });
    m.pools[outcome] = String(BigInt(m.pools[outcome]) + BigInt(stake));
  }
}

for (const m of open) {
  db.markets[m.key] = { ...m, status: "open", onchainId: `0xdemo${m.key.replace(/\W/g, "")}` };
  addPicks(db.markets[m.key], now - 3 * 3600_000);
}
db.markets[open[0].key].pools[0] = String(BigInt(db.markets[open[0].key].pools[0]) + BigInt(0.5 * MIST));

// Twelve settled markets over the last few days, so the race has moved.
for (let d = 0; d < 12; d++) {
  const at = now - (12 - d) * 8 * 3600_000;
  const p = 0.25 + rnd() * 0.5;
  const m: MarketRec = {
    key: `demo:${d}`,
    source: "polymarket",
    sourceId: `${d}`,
    question: ["Will BTC close above $80k Friday?", "Lakers vs. Suns", "Will the Fed hold rates?", "Arsenal vs Chelsea", "Will ETH dip to $2,300?", "Celtics vs. Knicks"][d % 6],
    category: (["crypto", "sports", "politics", "football", "crypto", "sports"] as const)[d % 6],
    league: ["bitcoin", "nba", "fed", "eng.1", "ethereum", "nba"][d % 6],
    outcomes: ["Yes", "No"],
    closesAt: at,
    ref: { polymarket: [p, 1 - p] },
    status: "open",
    pools: ["0", "0"],
    onchainId: `0xdemo${d}`,
  };
  db.markets[m.key] = m;
  addPicks(m, at - 6 * 3600_000);
  m.winner = rnd() < p ? 0 : 1;
  m.status = "resolved";
  m.resolvedAt = at + 3 * 3600_000;
  for (const pk of db.picks.filter((x) => x.marketKey === m.key)) record(db, pk, m);
  if (d === 5) snapshot(db);
  if (d === 5) db.snapshots[0].at = now - 30 * 3600_000;
}
snapshot(db);

const texts: [string, string][] = [
  ["lessons:contrarian", "[crypto/bitcoin] Fade a favourite only when its price moved 5+ pts in a day with no news."],
  ["scorecards", "The Skeptic WRONG on \"Celtics vs. Knicks\": said No 62%, Brier 0.77. Record in sports/nba: 4 scored, 25% hit rate."],
  ["picks", "The Quant on \"Will the Democratic Party control the Senate?\": backs Yes. Yes 64%, No 36%."],
  ["credibility", "Who to trust on politics: Polymarket skill 0.41 over 6; The Quant skill 0.33 over 6."],
  ["lessons:form", "[sports/nba] Discount win streaks shorter than four games when the line has already moved."],
];
texts.forEach(([namespace, text], j) => db.memory.push({ at: now - j * 600_000, namespace, text: `[demo] ${text}`, status: "stored", blobId: "demo" }));

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(db));
console.log(`seeded ${Object.keys(db.markets).length} markets, ${db.picks.length} picks into ${dir}`);
