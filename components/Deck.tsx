"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { AGENTS, AGENT_IDS, api, catColor, catIcon, payout, pct, sourceOf, sui, type Card, type Detail } from "./meta";

const STAKES = [10_000_000n, 50_000_000n, 100_000_000n, 500_000_000n, 1_000_000_000n];

function useCountdown(to: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, to - now);
  return { d: Math.floor(ms / 86400_000), h: Math.floor(ms / 3600_000) % 24, m: Math.floor(ms / 60_000) % 60, done: ms === 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");
const OUTCOME_COLORS = ["var(--c0)", "#d9d9e8", "var(--ink)"];

export function Deck({ cards, onPicked, toast }: { cards: Card[]; onPicked: () => void; toast: (s: string) => void }) {
  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const [fly, setFly] = useState<"l" | "r" | null>(null);
  const start = useRef<number | null>(null);
  const card = cards[Math.min(i, cards.length - 1)];

  useEffect(() => {
    if (i >= cards.length && cards.length) setI(cards.length - 1);
  }, [cards.length, i]);

  const go = (dir: 1 | -1) => {
    if (!cards.length) return;
    setFly(dir === 1 ? "l" : "r");
    setTimeout(() => {
      setI((x) => (x + dir + cards.length) % cards.length);
      setFly(null);
      setDx(0);
    }, 260);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!card)
    return (
      <div className="empty">
        <img src="/agents/skeptic.png" alt="" />
        <h2 style={{ font: "800 26px var(--display)", margin: "8px 0" }}>No open slips right now</h2>
        <p style={{ color: "var(--mute)", margin: 0 }}>The worker opens new markets from Polymarket and the football fixtures every few minutes.</p>
      </div>
    );

  const transform = fly ? `translateX(${fly === "l" ? -120 : 120}%) rotate(${fly === "l" ? -12 : 12}deg)` : `translateX(${dx}px) rotate(${dx / 30}deg)`;

  return (
    <div className="deck">
      <div className="ghost g2" />
      <div className="ghost" />
      <div
        className={`slip ${fly ? "flying" : start.current === null && dx === 0 ? "" : start.current === null ? "back" : ""}`}
        style={{ transform, opacity: fly ? 0 : 1, ["--c0" as string]: catColor(card.category) }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,textarea,input,a")) return;
          start.current = e.clientX;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
        onPointerUp={() => {
          const d = dx;
          start.current = null;
          if (Math.abs(d) > 110) go(d < 0 ? 1 : -1);
          else setDx(0);
        }}
      >
        <Slip key={card.key} card={card} index={i} total={cards.length} onPicked={onPicked} toast={toast} />
      </div>
      <div className="hint k">
        <button className="k" onClick={() => go(-1)}>← previous</button>
        <span>swipe or use arrow keys to browse · tap to pick</span>
        <button className="k" onClick={() => go(1)}>next →</button>
      </div>
    </div>
  );
}

function Slip({ card, index, total, onPicked, toast }: { card: Card; index: number; total: number; onPicked: () => void; toast: (s: string) => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const t = useCountdown(card.closesAt);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stake, setStake] = useState(STAKES[2]);
  const [conf, setConf] = useState(0.65);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api<Detail>(`/api/markets/${encodeURIComponent(card.key)}`).then((d) => live && setDetail(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [card.key, card.picks]);

  const binary = card.outcomes.length === 2;
  const refs = Object.entries(card.ref);
  const refName = (s: string) => sourceOf(s)?.name ?? s;
  const lead = binary ? 0 : card.trust.indexOf(Math.max(...card.trust));
  const tickRef = refs[0];
  // Where the public price would put the Yes/No boundary. Binary markets only.
  const tickAt = binary && tickRef ? tickRef[1][0] : null;

  const agentPicks = useMemo(() => {
    const m = new Map<string, Detail["picks"][number]>();
    for (const p of detail?.picks ?? []) if (AGENTS[p.forecaster] && !m.has(p.forecaster)) m.set(p.forecaster, p);
    return m;
  }, [detail]);
  const weightOf = (id: string) => detail?.contributors.find((c) => c.forecaster === id)?.w;

  async function pick(outcome: number) {
    if (!account) return toast("Connect a Sui wallet first (top right).");
    setBusy(outcome);
    try {
      const reasoning = why.trim();
      const { bytes } = await api<{ bytes: string }>("/api/tx/place", {
        marketKey: card.key,
        outcome,
        stakeMist: stake.toString(),
        confidence: conf,
        reasoning,
        sender: account.address,
      });
      const res = (await kit.signAndExecuteTransaction({ transaction: Transaction.from(bytes) })) as unknown as {
        $kind?: string;
        Transaction?: { digest: string };
        FailedTransaction?: { digest: string };
        digest?: string;
      };
      if (res.$kind === "FailedTransaction") throw new Error("transaction failed on chain");
      const digest = res.Transaction?.digest ?? res.digest;
      if (!digest) throw new Error("wallet returned no digest");
      await api("/api/picks", { digest, marketKey: card.key, outcome, confidence: conf, reasoning });
      toast(`Slip printed: ${card.outcomes[outcome]} · ${sui(stake)} SUI. It's on Sui and in Walrus.`);
      setWhy("");
      onPicked();
    } catch (e) {
      toast(`Pick failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="band" style={{ background: catColor(card.category) }}>
        <span>
          {catIcon(card.category)} {card.category.toUpperCase()}
          {card.league !== card.category ? ` · ${card.league.toUpperCase()}` : ""}
        </span>
        <span>
          SLIP {index + 1} OF {total}
        </span>
      </div>
      <div className="holes">
        {Array.from({ length: 18 }, (_, j) => (
          <i key={j} />
        ))}
      </div>
      <div className="sbody">
        <div className="qrow">
          <h1 className="q">{card.question}</h1>
          <div className="clock" title={new Date(card.closesAt).toUTCString()}>
            <div>{pad(t.d)}<small>DAYS</small></div>
            <div>{pad(t.h)}<small>HRS</small></div>
            <div>{pad(t.m)}<small>MIN</small></div>
          </div>
        </div>
        <div className="k">Trust line · weighted by who&apos;s been right</div>
        <div className="meter">
          {card.outcomes.map((o, j) => (
            <div
              key={o}
              className="seg"
              style={{ width: pct(card.trust[j]), background: j === 0 ? "var(--c0)" : OUTCOME_COLORS[j] ?? "#bbb", color: j === 1 ? "#555" : "#fff" }}
              title={`${o} ${pct(card.trust[j])}`}
            >
              {card.trust[j] > 0.16 ? `${binary ? o.toUpperCase() : o} ${pct(card.trust[j])}` : ""}
            </div>
          ))}
          {tickAt !== null && tickRef && (
            <div className="tick" style={{ left: pct(tickAt) }}>
              <span>
                {sourceOf(tickRef[0]) && <img className="srclogo" src={sourceOf(tickRef[0])!.img} alt="" style={{ width: 12, height: 12, marginRight: 4 }} />}
                {pct(tickRef[1][0])}
              </span>
            </div>
          )}
        </div>
        <div className="refs">
          {refs.slice(0, 1).map(([s, p]) => (
            <div className="ref" key={s}>
              <span className="k">
                {sourceOf(s) && <img className="srclogo" src={sourceOf(s)!.img} alt="" />}
                {refName(s)}
              </span>
              <b>{binary ? pct(p[0]) : `${card.outcomes[lead].split(" ")[0]} ${pct(p[lead])}`}</b>
            </div>
          ))}
          <div className="ref">
            <span className="k">SUI pool · {sui(card.poolMist.reduce((a, x) => a + BigInt(x), 0n))}</span>
            <b>{card.crowd ? (binary ? pct(card.crowd[0]) : pct(card.crowd[lead])) : "—"}</b>
          </div>
          <div className="ref" style={{ background: card.flag ? "#fdecec" : undefined }}>
            <span className="k">{card.flag ? "Sources disagree" : "Sources agree"}</span>
            <b className={card.flag ? "bad" : "ok"}>{card.flag ? `Δ ${Math.round(card.flag.gap * 100)} pts` : "✓"}</b>
          </div>
        </div>
        <div className="stake">
          <span className="k">Stake</span>
          {STAKES.map((s) => (
            <button key={s.toString()} className={s === stake ? "on" : ""} onClick={() => setStake(s)}>
              {sui(s)}
            </button>
          ))}
          <label className="conf">
            <span>{pct(conf)} sure</span>
            <input type="range" min={binary ? 0.5 : 0.34} max={0.99} step={0.01} value={conf} onChange={(e) => setConf(Number(e.target.value))} />
          </label>
        </div>
        <textarea className="why" maxLength={600} placeholder="Why? (optional, stored on Walrus, hashed onto your ticket)" value={why} onChange={(e) => setWhy(e.target.value)} />
        <div className="cta" style={{ ["--n" as string]: card.outcomes.length }}>
          {card.outcomes.map((o, j) => (
            <button
              key={o}
              disabled={busy !== null}
              onClick={() => pick(j)}
              style={
                j === 0
                  ? { background: "var(--c0)", color: "#fff" }
                  : j === 1 && binary
                    ? { background: "#fff", border: "2px solid var(--ink)", boxShadow: "0 5px 0 var(--ink)" }
                    : { background: "var(--ink)", color: "#fff" }
              }
            >
              {busy === j ? "Signing…" : binary ? o.toUpperCase() : o.length > 14 ? o.split(" ")[0] : o}
              <small>{payout(card.poolMist, j, stake).toFixed(1)}×</small>
            </button>
          ))}
        </div>
        <div className="crew">
          {AGENT_IDS.map((id) => {
            const a = AGENTS[id];
            const p = agentPicks.get(id);
            const w = weightOf(id);
            const top = p ? p.probs.indexOf(Math.max(...p.probs)) : 0;
            return (
              <a className="tile" key={id} href={`/f/${encodeURIComponent(id)}`} style={{ background: a.tint }}>
                {w !== undefined && <span className="w">{w.toFixed(1)}×</span>}
                {p && p.lessonsUsed.length > 0 && <span className="sticker">LESSON ✓</span>}
                <img src={`/agents/${a.slug}.png`} alt={a.short} />
                <b>{a.short}</b>
                {p ? (
                  <span className="p">{binary ? pct(p.probs[0]) : `${card.outcomes[top].split(" ")[0].slice(0, 10)} ${pct(p.probs[top])}`}</span>
                ) : (
                  <span className="tbd">thinking…</span>
                )}
                {p?.reasoning && (
                  <span className="why-pop">
                    {p.reasoning}
                    {p.lessonsUsed.length > 0 && (
                      <>
                        <br />
                        <b style={{ display: "inline", fontSize: 11 }}>Lesson: </b>
                        {p.lessonsUsed[0]}
                      </>
                    )}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
