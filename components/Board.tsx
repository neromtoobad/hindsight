"use client";
import { Fragment, useEffect, useState } from "react";
import { AGENTS, AGENT_IDS, api, catColor, catIcon, pct, sourceOf, sui, type Card, type Detail } from "./meta";

export type Selection = { card: Card; outcome: number };

const LEAGUES: Record<string, string> = {
  "eng.1": "Premier League",
  "uefa.champions": "Champions League",
  "esp.1": "La Liga",
  "ita.1": "Serie A",
  "ger.1": "Bundesliga",
  "fra.1": "Ligue 1",
  "uefa.europa": "Europa League",
  midterms: "US Midterms",
  elections: "Elections",
  nba: "NBA",
  nfl: "NFL",
  mlb: "MLB",
  nhl: "NHL",
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  solana: "Solana",
};
export const leagueName = (l: string) => LEAGUES[l] ?? l.replace(/(^|[-_ ])(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());

/** Decimal odds from the trust line: what a fair book would pay on 1 unit. */
export const odds = (p: number) => Math.min(99, Math.max(1.01, 1 / Math.max(p, 0.0101))).toFixed(2);

function when(t: number) {
  const ms = t - Date.now();
  if (ms <= 0) return { top: "Closed", sub: "" };
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = today ? "Today" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor(ms / 60_000) % 60;
  return { top: `${day} ${hm}`, sub: h < 24 ? `closes in ${h}h ${m}m` : "" };
}

export function Board({
  cards,
  selected,
  onSelect,
  mine,
}: {
  cards: Card[];
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  mine: Map<string, number[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (!cards.length)
    return (
      <div className="empty">
        <img src="/agents/skeptic.png" alt="" />
        <h2 style={{ font: "800 24px var(--display)", margin: "8px 0" }}>No open markets here right now</h2>
        <p style={{ color: "var(--mute)", margin: 0 }}>New markets open from Polymarket and the football fixtures every few minutes.</p>
      </div>
    );

  // Group by category, then league, keeping the soonest-closing groups first.
  const groups = new Map<string, Card[]>();
  for (const c of [...cards].sort((a, b) => a.closesAt - b.closesAt)) {
    const g = `${c.category}|${c.league}`;
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }

  return (
    <div className="board">
      {[...groups.entries()].map(([g, rows]) => {
        const [cat, league] = g.split("|");
        return (
          <section className="group" key={g}>
            <header className="ghead" style={{ ["--c" as string]: catColor(cat) }}>
              <span>
                {catIcon(cat)} {leagueName(league)}
              </span>
              <span className="k">{rows[0].outcomes.length === 3 ? "1 · X · 2" : "Yes · No"}</span>
            </header>
            {rows.map((c) => {
              const w = when(c.closesAt);
              const myOutcomes = mine.get(c.key) ?? [];
              const isOpen = open === c.key;
              return (
                <Fragment key={c.key}>
                  <div className={`row ${isOpen ? "expanded" : ""}`}>
                    <div className="when">
                      <b>{w.top}</b>
                      <span>{w.sub}</span>
                    </div>
                    <button className="event" onClick={() => setOpen(isOpen ? null : c.key)}>
                      <span className="title">{c.question}</span>
                      <span className="meta">
                        {c.picks > 0 && <span>{c.picks} calls</span>}
                        <span>pool {sui(c.poolMist.reduce((a, x) => a + BigInt(x), 0n))} SUI</span>
                        {c.flag && <span className="flag">Δ{Math.round(c.flag.gap * 100)} vs {sourceOf(c.flag.source)?.name ?? c.flag.source}</span>}
                        {myOutcomes.length > 0 && <span className="mine">your bet</span>}
                        <span className="more">{isOpen ? "hide ▴" : "who's calling ▾"}</span>
                      </span>
                    </button>
                    <div className="prices" style={{ ["--n" as string]: c.outcomes.length }}>
                      {c.outcomes.map((o, j) => {
                        const on = selected?.card.key === c.key && selected.outcome === j;
                        return (
                          <button key={o} className={`price ${on ? "on" : ""} ${myOutcomes.includes(j) ? "held" : ""}`} onClick={() => onSelect({ card: c, outcome: j })} title={`${o} · trust line ${pct(c.trust[j])}`}>
                            <span className="o">{c.outcomes.length === 3 ? (j === 1 ? "Draw" : o) : o}</span>
                            <b>{odds(c.trust[j])}</b>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {isOpen && <Expanded card={c} />}
                </Fragment>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function Expanded({ card }: { card: Card }) {
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    api<Detail>(`/api/markets/${encodeURIComponent(card.key)}`).then(setD).catch(() => {});
  }, [card.key]);
  const agentPicks = new Map((d?.picks ?? []).filter((p) => AGENTS[p.forecaster]).map((p) => [p.forecaster, p]));
  const k = card.outcomes.length;

  return (
    <div className="detail">
      <div className="lines">
        <div className="line">
          <span className="k">Trust line</span>
          {card.outcomes.map((o, j) => (
            <span key={o}>
              {o.split(" ")[0]} <b>{pct(card.trust[j])}</b>
            </span>
          ))}
        </div>
        {Object.entries(card.ref).map(([s, p]) => (
          <div className="line" key={s}>
            <span className="k">
              {sourceOf(s) && <img className="srclogo" src={sourceOf(s)!.img} alt="" />}
              {sourceOf(s)?.name ?? s}
            </span>
            {p.slice(0, k).map((x, j) => (
              <span key={j}>
                {card.outcomes[j].split(" ")[0]} <b>{pct(x)}</b>
              </span>
            ))}
          </div>
        ))}
        <div className="line">
          <span className="k">SUI pool</span>
          {card.crowd ? card.outcomes.map((o, j) => (
            <span key={o}>
              {o.split(" ")[0]} <b>{pct(card.crowd![j])}</b>
            </span>
          )) : <span>no money in yet</span>}
        </div>
      </div>
      <div className="calls">
        {AGENT_IDS.map((id) => {
          const a = AGENTS[id];
          const p = agentPicks.get(id);
          const top = p ? p.probs.indexOf(Math.max(...p.probs)) : -1;
          const w = d?.contributors.find((c) => c.forecaster === id)?.w;
          return (
            <a className="call" key={id} href={`/f/${encodeURIComponent(id)}`} style={{ background: a.tint }}>
              <img src={`/agents/${a.slug}-head.png`} alt="" />
              <div>
                <div className="who">
                  <b>{a.short}</b>
                  {w !== undefined && <span className="w2">{w.toFixed(1)}× trust</span>}
                  {p && p.lessonsUsed.length > 0 && <span className="sticker" style={{ position: "static", transform: "none" }}>LESSON ✓</span>}
                </div>
                {p ? (
                  <>
                    <div className="mono" style={{ fontSize: 12.5 }}>
                      {card.outcomes[top]} {pct(p.probs[top])}
                    </div>
                    <div className="callwhy">{p.reasoning}</div>
                  </>
                ) : (
                  <div className="callwhy">Calls this market in the last 36 hours before it closes.</div>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
