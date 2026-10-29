// Read models for the API. Pure functions over the store.
import { line, disagreement, skill, weight } from "./credibility";
import type { Db, MarketRec, PickRec } from "./types";
import { agentAddresses, PERSONAS } from "./agents";

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
    icon: m.icon ?? null,
    logos: m.logos ?? null,
    colors: m.colors ?? null,
    leagueLogo: m.leagueLogo ?? null,
    ref: m.ref,
    trust: l.trust,
    crowd: l.crowd,
    poolMist: m.pools,
    picks: picks.filter((p) => p.forecaster.startsWith("source:") === false).length,
    flag: d.gap >= 0.08 ? { source: d.source, gap: d.gap, outcome: d.outcome } : null,
    // Who stands where on this market: latest call per forecaster with its trust weight.
    stands: l.contributors.slice(0, 14).map((c) => ({
      id: c.forecaster,
      name: db.forecasters[c.forecaster]?.name ?? c.forecaster,
      kind: db.forecasters[c.forecaster]?.kind ?? "human",
      avatar: db.forecasters[c.forecaster]?.avatar ?? null,
      tint: db.forecasters[c.forecaster]?.tint ?? null,
      w: +c.w.toFixed(2),
      probs: c.probs.map((x) => +x.toFixed(3)),
      reasoning: picks.filter((p) => p.forecaster === c.forecaster).sort((a, b) => b.placedAt - a.placedAt)[0]?.reasoning ?? null,
      lesson: picks.filter((p) => p.forecaster === c.forecaster).sort((a, b) => b.placedAt - a.placedAt)[0]?.lessonsUsed?.[0] ?? null,
    })),
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
    claimed: Boolean(p.claimed),
    status: mm?.status,
    winner: mm?.winner,
    weight: mm ? weight(db, p.forecaster, mm).w : 1,
  };
}

export function leaderboard(db: Db, scope = "all") {
  // The race shows movement: weight now against the newest snapshot at least ~20h old.
  const cutoff = Date.now() - 20 * 3600_000;
  const prev = [...db.snapshots].reverse().find((s) => s.at <= cutoff) ?? db.snapshots[0];
  return Object.values(db.forecasters)
    .map((f) => {
      const s = skill(db, f.id, scope);
      const picks = db.picks.filter((p) => p.forecaster === f.id);
      const w = Math.exp(4 * s.skill * (s.n / (s.n + 4)));
      const wPrev = prev?.weights[f.id]?.[scope] ?? 1;
      return { id: f.id, name: f.name, kind: f.kind, blurb: f.blurb, avatar: f.avatar ?? null, tint: f.tint ?? null, ...s, w, trend: w - wPrev, picks: picks.length, open: picks.filter((p) => p.brier === undefined).length };
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

/** Paid x402 calls, newest first, with payer and market named. */
export function x402Feed(db: Db, limit = 12) {
  const agents = agentAddresses();
  const price = process.env.SHARP_PRICE_MIST ?? "10000000";
  const rows = Object.entries(db.paid)
    .map(([digest, p]) => {
      const key = decodeURIComponent(p.resource.split("/").pop() ?? "");
      const slug = agents[p.payer];
      const persona = PERSONAS.find((x) => x.slug === slug);
      return {
        digest,
        at: p.at,
        mist: p.mist ?? price,
        payer: p.payer,
        payerId: slug ? `agent:${slug}` : p.payer,
        payerName: persona?.name ?? db.forecasters[p.payer]?.name ?? `${p.payer.slice(0, 6)}…${p.payer.slice(-4)}`,
        marketKey: key,
        question: db.markets[key]?.question ?? key,
      };
    })
    .sort((a, b) => b.at - a.at);
  return { calls: rows.length, totalMist: String(rows.reduce((s, r) => s + BigInt(r.mist), 0n)), recent: rows.slice(0, limit) };
}
