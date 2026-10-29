// Read models for the API. Pure functions over the store.
import { line, disagreement, skill, weight } from "./credibility";
import type { Db, MarketRec, PickRec } from "./types";

export function marketCard(db: Db, m: MarketRec) {
  const l = line(db, m);
  const d = disagreement(l, m);
  const picks = db.picks.filter((p) => p.marketKey === m.key);
  return {
    key: m.key,
    question: m.question,
    category: m.category,
    league: m.league,
    outcomes: m.outcomes,
    closesAt: m.closesAt,
    status: m.status,
    winner: m.winner,
    url: m.url,
    onchainId: m.onchainId,
    ref: m.ref,
    trust: l.trust,
    crowd: l.crowd,
    poolMist: m.pools,
    picks: picks.filter((p) => p.forecaster.startsWith("source:") === false).length,
    flag: d.gap >= 0.08 ? { source: d.source, gap: d.gap, outcome: d.outcome } : null,
  };
}

export function marketDetail(db: Db, m: MarketRec) {
  const l = line(db, m);
  const picks = db.picks
    .filter((p) => p.marketKey === m.key)
    .sort((a, b) => b.placedAt - a.placedAt)
    .map((p) => pickView(db, p, m));
  return { ...marketCard(db, m), contributors: l.contributors.map((c) => ({ ...c, name: db.forecasters[c.forecaster]?.name ?? c.forecaster })), picks, createdTx: m.createdTx, resolveTx: m.resolveTx };
}

export function pickView(db: Db, p: PickRec, m?: MarketRec) {
  const mm = m ?? db.markets[p.marketKey];
  const f = db.forecasters[p.forecaster];
  return {
    id: p.id,
    marketKey: p.marketKey,
    question: mm?.question,
    outcomes: mm?.outcomes,
    forecaster: p.forecaster,
    name: f?.name ?? p.forecaster,
    kind: f?.kind ?? "human",
    probs: p.probs,
    outcome: p.outcome,
    stakeMist: p.stakeMist,
    reasoning: p.reasoning,
    lessonsUsed: p.lessonsUsed ?? [],
    noteHash: p.noteHash,
    placedAt: p.placedAt,
    tx: p.tx,
    ticketId: p.ticketId,
    brier: p.brier,
    correct: p.correct,
    weight: mm ? weight(db, p.forecaster, mm).w : 1,
  };
}

export function leaderboard(db: Db, scope = "all") {
  return Object.values(db.forecasters)
    .map((f) => {
      const s = skill(db, f.id, scope);
      const picks = db.picks.filter((p) => p.forecaster === f.id);
      return { id: f.id, name: f.name, kind: f.kind, blurb: f.blurb, ...s, picks: picks.length, open: picks.filter((p) => p.brier === undefined).length };
    })
    .sort((a, b) => b.skill * Math.min(1, b.n / 5) - a.skill * Math.min(1, a.n / 5) || b.picks - a.picks);
}

export function profile(db: Db, id: string) {
  const f = db.forecasters[id];
  if (!f) return null;
  const scopes = Object.entries(db.cred[id] ?? {}).map(([scope]) => ({ scope, ...skill(db, id, scope) }));
  const history = db.snapshots.map((s) => ({ at: s.at, w: s.weights[id]?.all ?? 1 }));
  const picks = db.picks
    .filter((p) => p.forecaster === id)
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 100)
    .map((p) => pickView(db, p));
  return { ...f, scopes: scopes.sort((a, b) => b.n - a.n), history, picks };
}

export function memoryFeed(db: Db, namespace?: string, limit = 60) {
  return db.memory
    .filter((m) => !namespace || m.namespace === namespace || m.namespace.startsWith(namespace + ":"))
    .slice(-limit)
    .reverse();
}

export function stats(db: Db) {
  const markets = Object.values(db.markets);
  const stored = db.memory.filter((m) => m.status === "stored").length;
  const staked = db.picks.reduce((s, p) => s + BigInt(p.stakeMist ?? "0"), 0n);
  return {
    markets: markets.length,
    open: markets.filter((m) => m.status === "open").length,
    resolved: markets.filter((m) => m.status === "resolved").length,
    picks: db.picks.filter((p) => !p.forecaster.startsWith("source:")).length,
    stakedMist: String(staked),
    memories: stored,
    memoriesQueued: db.memory.filter((m) => m.status === "queued").length,
  };
}
