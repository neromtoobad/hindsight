import { env } from "./env";
import { load, mutate } from "./store";
import * as pm from "./sources/polymarket";
import * as espn from "./sources/espn";
import * as chain from "./sui";
import { remember, recall, sha256 } from "./memory";
import { PERSONAS, agentWallets, decide, lessonFrom, type Persona } from "./agents";
import { brier, line, record, skill, snapshot } from "./credibility";
import type { Db, MarketRec, PickRec } from "./types";

const MAX_OPEN = Number(process.env.MAX_OPEN_MARKETS ?? 24);
/** Agents call a market only inside this window before close, so they see fresh information. */
const AGENT_WINDOW_MS = Number(process.env.AGENT_WINDOW_HOURS ?? 36) * 3600_000;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const iso = (t: number) => new Date(t).toISOString().slice(0, 16) + "Z";

export const SOURCES = {
  "source:polymarket": { name: "Polymarket", blurb: "Onchain order book prices on Polygon." },
  "source:bookmaker": { name: "Bookmakers", blurb: "DraftKings closing line via ESPN, vig removed." },
} as const;

export const agentId = (p: Persona) => `agent:${p.slug}`;

export function ensureForecasters(db: Db) {
  for (const [id, s] of Object.entries(SOURCES)) db.forecasters[id] ??= { id, kind: "source", ...s };
  for (const p of PERSONAS) db.forecasters[agentId(p)] ??= { id: agentId(p), kind: "agent", name: p.name, blurb: p.blurb };
}

function upsertSourcePicks(db: Db, m: MarketRec) {
  for (const [src, probs] of Object.entries(m.ref)) {
    const id = `source:${src}`;
    const existing = db.picks.find((p) => p.marketKey === m.key && p.forecaster === id);
    if (existing) {
      existing.probs = probs;
      existing.placedAt = Date.now();
    } else {
      db.picks.push({ id: `${m.key}:${id}`, marketKey: m.key, forecaster: id, probs, placedAt: Date.now() });
    }
  }
}

// --- 1. Markets ---

export async function syncMarkets(log = console.log) {
  const now = Date.now();
  const db = load();
  const open = Object.values(db.markets).filter((m) => m.status === "open");

  // Refresh public reference prices on open markets until they close.
  for (const m of open.filter((m) => m.closesAt > now)) {
    try {
      const p = m.source === "polymarket" ? await pm.prices(m.sourceId) : await espn.refreshOdds(m.sourceId);
      if (p) await mutate((d) => {
        const mm = d.markets[m.key];
        mm.ref[m.source === "polymarket" ? "polymarket" : "bookmaker"] = p;
        upsertSourcePicks(d, mm);
      });
    } catch (e) {
      log(`ref ${m.key}: ${(e as Error).message}`);
    }
  }

  const room = MAX_OPEN - open.filter((m) => m.closesAt > now).length;
  if (room <= 0) return;
  const [football, rest] = await Promise.all([espn.discover(now).catch(() => []), pm.discover(now).catch(() => [])]);
  // Football with a bookmaker line first (it is the "compare bookmakers" story), then everything else.
  const candidates = [
    ...football.filter((m) => m.ref.bookmaker).sort((a, b) => a.closesAt - b.closesAt).slice(0, Math.ceil(room / 3)),
    ...rest,
  ].filter((m) => !db.markets[m.key]);

  for (const m of candidates.slice(0, room)) {
    try {
      const { marketId, digest } = await chain.createMarket({
        key: m.key,
        question: m.question,
        category: m.category,
        source: m.source,
        outcomes: m.outcomes,
        closesAt: m.closesAt,
      });
      await mutate((d) => {
        ensureForecasters(d);
        d.markets[m.key] = { ...m, status: "open", onchainId: marketId, createdTx: digest };
        upsertSourcePicks(d, d.markets[m.key]);
      });
      log(`opened ${m.key} ${m.question} -> ${marketId}`);
      await new Promise((r) => setTimeout(r, 800)); // stay under Tatum's burst limit
    } catch (e) {
      log(`create ${m.key}: ${(e as Error).message}`);
    }
  }
}

// --- 2. House agents ---

export async function fundAgents(log = console.log) {
  const wallets = agentWallets();
  const r = chain.resolver();
  const floor = BigInt(process.env.AGENT_FLOOR_MIST ?? "150000000"); // 0.15 SUI
  const topUp = BigInt(process.env.AGENT_TOPUP_MIST ?? "600000000"); // 0.6 SUI
  // Keep enough on the resolver to open and settle markets.
  const reserve = BigInt(process.env.RESOLVER_RESERVE_MIST ?? "250000000"); // 0.25 SUI
  for (const [slug, w] of Object.entries(wallets)) {
    const bal = await chain.balanceOf(w.address);
    if (bal < floor) {
      if ((await chain.balanceOf(r.toSuiAddress())) < topUp + reserve) {
        log(`resolver too low to fund ${slug}; skipping`);
        continue;
      }
      const d = await chain.sendSui(r, w.address, topUp);
      log(`funded ${slug} ${chain.fmtSui(topUp)} SUI (${d})`);
    }
  }
}

export async function agentRound(maxPicks = Number(process.env.AGENT_PICKS_PER_ROUND ?? 10), log = console.log) {
  const now = Date.now();
  const wallets = agentWallets();
  let done = 0;
  const db0 = load();
  const due = Object.values(db0.markets)
    .filter((m) => m.status === "open" && m.onchainId && m.closesAt > now + 10 * 60_000 && m.closesAt - now < AGENT_WINDOW_MS)
    .sort((a, b) => a.closesAt - b.closesAt);

  // Check wallets before spending model calls: a pick needs the stake plus gas.
  const need = env.agentStakeMist + 6_000_000n;
  const broke = new Set<string>();
  for (const p of PERSONAS) {
    const bal = await chain.balanceOf(wallets[p.slug].address).catch(() => 0n);
    if (bal < need) broke.add(p.slug);
  }
  if (broke.size) log(`agents without gas: ${[...broke].join(", ")}`);

  for (const m of due) {
    for (const p of PERSONAS) {
      if (done >= maxPicks) return done;
      if (broke.has(p.slug)) continue;
      const id = agentId(p);
      if (load().picks.some((x) => x.marketKey === m.key && x.forecaster === id)) continue;
      try {
        await agentPick(p, m, wallets[p.slug].secret, now);
        done++;
      } catch (e) {
        log(`${p.slug} on ${m.key}: ${(e as Error).message}`);
      }
    }
  }
  return done;
}

async function agentPick(p: Persona, m: MarketRec, secret: string, now: number) {
  const id = agentId(p);
  const scope = `${m.category}/${m.league}`;
  // The learning loop: recall this agent's own lessons and scorecards from Walrus before deciding.
  const [lessons, history] = await Promise.all([
    recall(`lessons:${p.slug}`, `${scope}: ${m.question}`, 5),
    recall("scorecards", `${p.name} ${scope}`, 4, "recent"),
  ]);
  const trust = line(load(), m).trust;
  const out = await decide(p, m, {
    lessons: lessons.map((l) => l.text),
    history: history.map((h) => h.text).filter((t) => t.includes(p.name)),
    trust,
    now,
  });
  const note = `[${iso(now)}] ${p.name} on "${m.question}" (${m.key}): backs ${m.outcomes[out.pick]}. ${m.outcomes
    .map((o, i) => `${o} ${pct(out.probs[i])}`)
    .join(", ")}. ${out.reasoning}${out.lessons_applied.length ? ` Lessons applied: ${out.lessons_applied.join(" | ")}` : ""}`;
  const hash = sha256(note);
  const { digest, placed } = await chain.placeAs(chain.keypairFrom(secret), {
    marketId: m.onchainId!,
    outcome: out.pick,
    stakeMist: env.agentStakeMist,
    noteHash: hash,
  });
  await remember("picks", note, `pick:${placed.ticket_id}`);
  await mutate((d) => {
    d.picks.push({
      id: placed.ticket_id,
      marketKey: m.key,
      forecaster: id,
      probs: out.probs,
      outcome: out.pick,
      stakeMist: String(placed.stake),
      reasoning: out.reasoning,
      noteHash: hash.toString("hex"),
      lessonsUsed: out.lessons_applied,
      placedAt: Number(placed.placed_at_ms),
      tx: digest,
      ticketId: placed.ticket_id,
    });
    addToPool(d.markets[m.key], out.pick, BigInt(placed.stake));
  });
}

function addToPool(m: MarketRec, outcome: number, stake: bigint) {
  m.pools[outcome] = String(BigInt(m.pools[outcome] ?? "0") + stake);
}

// --- 3. Human picks (from the browser, verified on chain through Tatum) ---

export const humanNote = (n: { marketKey: string; outcome: number; confidence: number; reasoning: string }) =>
  JSON.stringify({ m: n.marketKey, o: n.outcome, c: n.confidence, r: n.reasoning.trim() });

export async function ingestHumanPick(input: {
  digest: string;
  marketKey: string;
  outcome: number;
  confidence: number;
  reasoning: string;
  name?: string;
}) {
  const { placed, sender } = await chain.readPlaced(input.digest);
  const db = load();
  const m = db.markets[input.marketKey];
  if (!m || m.onchainId !== placed.market_id) throw new Error("market mismatch");
  if (Number(placed.outcome) !== input.outcome) throw new Error("outcome mismatch");
  const hash = sha256(humanNote(input)).toString("hex");
  if (Buffer.from(placed.note_hash).toString("hex") !== hash) throw new Error("reasoning does not match the hash on chain");
  if (db.picks.some((p) => p.id === placed.ticket_id)) return placed.ticket_id;

  const k = m.outcomes.length;
  const c = Math.min(0.99, Math.max(1 / k, input.confidence));
  const probs = m.outcomes.map((_, i) => (i === input.outcome ? c : (1 - c) / (k - 1)));
  await mutate((d) => {
    d.forecasters[sender] ??= { id: sender, kind: "human", name: input.name?.slice(0, 32) || `${sender.slice(0, 6)}…${sender.slice(-4)}` };
    d.picks.push({
      id: placed.ticket_id,
      marketKey: m.key,
      forecaster: sender,
      probs,
      outcome: input.outcome,
      stakeMist: String(placed.stake),
      reasoning: input.reasoning.trim(),
      noteHash: hash,
      placedAt: Number(placed.placed_at_ms),
      tx: input.digest,
      ticketId: placed.ticket_id,
    });
    addToPool(d.markets[m.key], input.outcome, BigInt(placed.stake));
  });
  const name = load().forecasters[sender].name;
  await remember(
    "picks",
    `[${iso(Number(placed.placed_at_ms))}] ${name} (${sender}) on "${m.question}" (${m.key}): backs ${m.outcomes[input.outcome]} at ${pct(c)} confidence. ${input.reasoning.trim()}`,
    `pick:${placed.ticket_id}`,
  );
  await remember(`user:${sender}`, `${name} follows ${m.category}/${m.league}; picked ${m.outcomes[input.outcome]} on "${m.question}" at ${pct(c)}.`);
  return placed.ticket_id;
}

// --- 4. Resolution, scorecards, lessons ---

export async function resolveRound(log = console.log) {
  const now = Date.now();
  const due = Object.values(load().markets).filter((m) => m.status === "open" && m.closesAt <= now);
  for (const m of due) {
    let res: number | "void" | null = null;
    try {
      res = m.source === "polymarket" ? await pm.result(m.sourceId) : await espn.result(m.sourceId);
    } catch (e) {
      log(`result ${m.key}: ${(e as Error).message}`);
    }
    // Give a source two weeks to settle, then refund everyone.
    if (res === null && now - m.closesAt > 14 * 86400_000) res = "void";
    if (res === null) continue;
    try {
      if (res === "void") {
        const digest = await chain.voidMarket(m.onchainId!);
        await mutate((d) => Object.assign(d.markets[m.key], { status: "void", resolvedAt: now, resolveTx: digest }));
        await remember("scorecards", `[${iso(now)}] VOID "${m.question}" (${m.key}): the source never settled or the event was called off. All stakes refundable.`);
        log(`voided ${m.key}`);
        continue;
      }
      const { digest, voided } = await chain.resolveMarket(m.onchainId!, res);
      await settle(m.key, res, voided, digest, now);
      log(`resolved ${m.key} -> ${m.outcomes[res]}${voided ? " (void: nobody backed it)" : ""}`);
    } catch (e) {
      log(`resolve ${m.key}: ${(e as Error).message}`);
    }
  }
}

async function settle(key: string, winner: number, voided: boolean, digest: string, now: number) {
  const before = load();
  const m0 = before.markets[key];
  const lineAtClose = line(before, m0);
  const scored: PickRec[] = await mutate((d) => {
    const m = d.markets[key];
    Object.assign(m, { status: voided ? "void" : "resolved", winner, resolvedAt: now, resolveTx: digest });
    const picks = d.picks.filter((p) => p.marketKey === key);
    for (const p of picks) record(d, p, m);
    return picks;
  });
  const db = load();
  const m = db.markets[key];
  const won = m.outcomes[winner];

  // Market summary: how each line did. This is the memory the "who to trust" answers draw from.
  const trustB = brier(lineAtClose.trust, winner);
  const refs = Object.entries(m.ref).map(([s, p]) => `${s} had ${won} at ${pct(p[winner])} (Brier ${brier(p, winner).toFixed(2)})`);
  await remember(
    "scorecards",
    `[${iso(now)}] RESULT "${m.question}" (${m.key}, ${m.category}/${m.league}): ${won}. Trust line had ${won} at ${pct(lineAtClose.trust[winner])} (Brier ${trustB.toFixed(2)})${refs.length ? "; " + refs.join("; ") : ""}${lineAtClose.crowd ? `; the SUI pool had ${pct(lineAtClose.crowd[winner])}` : ""}.`,
    `result:${key}`,
  );

  for (const p of scored) {
    const f = db.forecasters[p.forecaster];
    const s = skill(db, p.forecaster, `${m.category}/${m.league}`);
    await remember(
      "scorecards",
      `[${iso(now)}] ${f?.name ?? p.forecaster} ${p.correct ? "RIGHT" : "WRONG"} on "${m.question}": said ${won} ${pct(p.probs[winner])}, Brier ${p.brier!.toFixed(2)}. Record in ${m.category}/${m.league}: ${s.n} scored, ${pct(s.hitRate)} hit rate, skill ${s.skill.toFixed(2)}.`,
      `score:${p.id}`,
    );
  }

  // Agents that missed badly write a lesson; they recall it before their next pick in this scope.
  for (const p of scored.filter((x) => x.forecaster.startsWith("agent:") && (x.brier ?? 0) > 0.5)) {
    const persona = PERSONAS.find((x) => `agent:${x.slug}` === p.forecaster);
    if (!persona) continue;
    try {
      const lesson = await lessonFrom(persona, m, p);
      if (lesson) await remember(`lessons:${persona.slug}`, `[${m.category}/${m.league}] ${lesson} (after "${m.question}", ${iso(now)})`, `lesson:${p.id}`);
    } catch {}
  }
}

/** House agents collect winnings and refunds so their stakes recycle. */
export async function agentClaimRound(log = console.log) {
  const wallets = agentWallets();
  const db = load();
  for (const p of db.picks) {
    if (!p.forecaster.startsWith("agent:") || !p.ticketId || p.claimed) continue;
    const m = db.markets[p.marketKey];
    const owed = m.status === "void" || (m.status === "resolved" && p.outcome === m.winner);
    if (!owed) continue;
    const w = wallets[p.forecaster.slice("agent:".length)];
    if (!w) continue;
    try {
      const kp = chain.keypairFrom(w.secret);
      await chain.runAs(chain.buildClaimTx({ marketId: m.onchainId!, ticketId: p.ticketId, sender: w.address }), kp);
      await mutate((d) => Object.assign(d.picks.find((x) => x.id === p.id)!, { claimed: true }));
    } catch (e) {
      log(`claim ${p.id}: ${(e as Error).message}`);
    }
  }
}

// --- 5. Credibility snapshots ---

export async function credibilityRound() {
  await mutate((d) => snapshot(d));
  const db = load();
  const rows = Object.entries(db.cred)
    .map(([f, cells]) => ({ f, name: db.forecasters[f]?.name ?? f, cells }))
    .filter((r) => r.cells.all?.n);
  if (!rows.length) return;
  const scopes = new Set(rows.flatMap((r) => Object.keys(r.cells)));
  for (const s of scopes) {
    const ranked = rows
      .filter((r) => r.cells[s]?.n)
      .map((r) => ({ name: r.name, ...skill(db, r.f, s) }))
      .sort((a, b) => b.skill - a.skill);
    if (!ranked.length) continue;
    await remember(
      "credibility",
      `[${iso(Date.now())}] Who to trust on ${s}: ${ranked.map((r) => `${r.name} skill ${r.skill.toFixed(2)} over ${r.n} (${pct(r.hitRate)} right)`).join("; ")}.`,
    );
  }
}
