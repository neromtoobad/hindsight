// Who to trust, per scope. Every scored pick moves a forecaster's running Brier score in three
// scopes: "all", the category ("politics") and the league ("politics/midterms"). Weight is
// exp(4 * skill * n/(n+4)) where skill = 1 - meanBrier / coinFlipBrier: a forecaster with no
// record weighs 1, a sharp one with history weighs several times more, a bad one fades out.
import type { Db, MarketRec, PickRec } from "./types";

export function brier(probs: number[], winner: number) {
  return probs.reduce((s, p, i) => s + (p - (i === winner ? 1 : 0)) ** 2, 0);
}

/** Brier of a uniform guess over k outcomes. */
const coinFlip = (k: number) => 1 - 1 / k;

export const scopesOf = (m: Pick<MarketRec, "category" | "league">) => ["all", m.category, `${m.category}/${m.league}`];

export function record(db: Db, pick: PickRec, m: MarketRec) {
  if (m.winner === undefined) return;
  const b = brier(pick.probs, m.winner);
  const top = pick.probs.indexOf(Math.max(...pick.probs));
  pick.brier = b;
  pick.correct = (pick.outcome ?? top) === m.winner;
  // Normalise so 2- and 3-way markets share one scale: 0 = perfect, 1 = coin flip.
  const norm = b / coinFlip(m.outcomes.length);
  const cells = (db.cred[pick.forecaster] ??= {});
  for (const s of scopesOf(m)) {
    const c = (cells[s] ??= { n: 0, brierSum: 0, hits: 0 });
    c.n += 1;
    c.brierSum += norm;
    c.hits += pick.correct ? 1 : 0;
  }
}

export function skill(db: Db, forecaster: string, scope: string) {
  const c = db.cred[forecaster]?.[scope];
  if (!c || c.n === 0) return { skill: 0, n: 0, hitRate: 0 };
  return { skill: 1 - c.brierSum / c.n, n: c.n, hitRate: c.hits / c.n };
}

/** Weight for a forecaster on a market: the most specific scope with 3+ scored picks wins. */
export function weight(db: Db, forecaster: string, m: Pick<MarketRec, "category" | "league">) {
  const scopes = scopesOf(m).reverse();
  for (const s of scopes) {
    const k = skill(db, forecaster, s);
    if (k.n >= 3 || s === "all") {
      const w = Math.exp(4 * k.skill * (k.n / (k.n + 4)));
      return { w, scope: s, ...k };
    }
  }
  return { w: 1, scope: "all", skill: 0, n: 0, hitRate: 0 };
}

const latestPerForecaster = (picks: PickRec[]) => {
  const by = new Map<string, PickRec>();
  for (const p of picks) {
    const cur = by.get(p.forecaster);
    if (!cur || p.placedAt > cur.placedAt) by.set(p.forecaster, p);
  }
  return [...by.values()];
};

export interface Line {
  /** Credibility-weighted probability per outcome. */
  trust: number[];
  /** Money in the onchain pool, per outcome share. */
  crowd: number[] | null;
  contributors: { forecaster: string; w: number; scope: string; n: number; probs: number[] }[];
}

export function line(db: Db, m: MarketRec): Line {
  const k = m.outcomes.length;
  const picks = latestPerForecaster(db.picks.filter((p) => p.marketKey === m.key));
  const contributors = picks.map((p) => {
    const w = weight(db, p.forecaster, m);
    return { forecaster: p.forecaster, w: w.w, scope: w.scope, n: w.n, probs: p.probs };
  });
  const trust = new Array(k).fill(0);
  let W = 0;
  for (const c of contributors) {
    W += c.w;
    c.probs.forEach((p, i) => (trust[i] += c.w * p));
  }
  const total = m.pools.reduce((s, x) => s + Number(x), 0);
  return {
    trust: W > 0 ? trust.map((x) => x / W) : new Array(k).fill(1 / k),
    crowd: total > 0 ? m.pools.map((x) => Number(x) / total) : null,
    contributors: contributors.sort((a, b) => b.w - a.w),
  };
}

/** Largest gap between the trust line and any public reference, for "sources disagree" flags. */
export function disagreement(l: Line, m: MarketRec) {
  let best = { source: "", gap: 0, outcome: 0 };
  for (const [source, probs] of Object.entries(m.ref)) {
    probs.forEach((p, i) => {
      const gap = Math.abs((l.trust[i] ?? 0) - p);
      if (gap > best.gap) best = { source, gap, outcome: i };
    });
  }
  return best;
}

export function snapshot(db: Db) {
  const weights: Record<string, Record<string, number>> = {};
  for (const [f, cells] of Object.entries(db.cred)) {
    weights[f] = {};
    for (const [scope, c] of Object.entries(cells)) {
      const s = 1 - c.brierSum / c.n;
      weights[f][scope] = Math.exp(4 * s * (c.n / (c.n + 4)));
    }
  }
  db.snapshots.push({ at: Date.now(), weights });
}
