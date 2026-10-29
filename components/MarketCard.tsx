"use client";
import { catColor, catIcon, pct, sourceOf, sui, type Card } from "./meta";
import { Stage, type You } from "./Line";

export const LEAGUES: Record<string, string> = {
  "eng.1": "Premier League",
  "uefa.champions": "Champions League",
  "uefa.europa": "Europa League",
  "esp.1": "La Liga",
  "ita.1": "Serie A",
  "ger.1": "Bundesliga",
  "fra.1": "Ligue 1",
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

/** Decimal odds from the trust line: what a fair book pays per unit staked. */
export const odds = (p: number) => Math.min(99, Math.max(1.01, 1 / Math.max(p, 0.0101))).toFixed(2);

export function closes(t: number) {
  const ms = t - Date.now();
  if (ms <= 0) return "closed";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor(ms / 60_000) % 60;
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const defaultYou = (c: Card, j: number): You => ({
  outcome: j,
  conf: Math.min(0.95, Math.max(c.outcomes.length === 2 ? 0.55 : 0.4, +c.trust[j].toFixed(2))),
});

export function MarketCard({
  card,
  selected,
  held,
  onPick,
}: {
  card: Card;
  selected?: number | null;
  held?: number[];
  onPick: (you: You) => void;
}) {
  const agents = card.stands.filter((s) => s.id.startsWith("agent:")).length;
  const soon = card.closesAt - Date.now() < 6 * 3600_000;
  return (
    <article className={`mcard ${selected != null ? "sel" : ""}`} style={{ ["--c" as string]: catColor(card.category) }}>
      <div className="mtop">
        <span className="league">
          {catIcon(card.category)} {leagueName(card.league)}
        </span>
        <span className={`clock2 ${soon ? "hot" : ""}`}>⏱ {closes(card.closesAt)}</span>
      </div>
      <a className="mq" href={`/m/${encodeURIComponent(card.key)}`}>
        {card.question}
      </a>
      {card.flag && (
        <div className="flag2">
          Hindsight is {Math.round(card.flag.gap * 100)} pts off {sourceOf(card.flag.source)?.name ?? card.flag.source} on {card.outcomes[card.flag.outcome]}
        </div>
      )}
      <Stage card={card} />
      <div className="odds" style={{ gridTemplateColumns: `repeat(${card.outcomes.length}, minmax(0, 1fr))` }}>
        {card.outcomes.map((o, j) => (
          <button key={o} className={`oddbtn ${selected === j ? "on" : ""} ${held?.includes(j) ? "held" : ""}`} onClick={() => onPick(defaultYou(card, j))}>
            <span>{card.outcomes.length === 3 && j === 1 ? "Draw" : o}</span>
            <b>{odds(card.trust[j])}</b>
          </button>
        ))}
      </div>
      <div className="mfoot">
        <span>{agents ? `${agents} agents called it` : "agents call it inside 36h of close"}</span>
        <span>pool {sui(card.poolMist.reduce((a, x) => a + BigInt(x), 0n))} SUI</span>
        <a href={`/m/${encodeURIComponent(card.key)}`}>open →</a>
      </div>
      {held && held.length > 0 && <span className="ribbon">your bet: {held.map((j) => card.outcomes[j]).join(", ")}</span>}
      <span className="sr">{card.outcomes.map((o, j) => `${o} ${pct(card.trust[j])}`).join(", ")}</span>
    </article>
  );
}
