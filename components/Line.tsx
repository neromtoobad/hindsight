"use client";
import { Help } from "./Help";
import { useRef } from "react";
import { AGENTS, SOURCES, avatar, pct, type Card } from "./meta";

export type Stand = Card["stands"][number];
/** Where you stand: the outcome you back and how sure you are. */
export type You = { outcome: number; conf: number };

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function Marker({ s, size, faded }: { s: Stand; size: number; faded?: boolean }) {
  const a = avatar(s.id, s);
  const title = `${s.name}: ${s.probs.map((p) => pct(p)).join(" / ")} · trust ${s.w.toFixed(1)}×`;
  const style = { width: size, height: size, opacity: faded ? 0.55 : 1 } as const;
  if (AGENTS[s.id]) return <img className="mk agent" src={a.img} alt={s.name} title={title} style={{ ...style, background: AGENTS[s.id].tint }} />;
  if (SOURCES[s.id]) return <img className="mk src" src={a.img} alt={s.name} title={title} style={style} />;
  if (a.img) return <img className="mk agent" src={a.img} alt={s.name} title={title} style={{ ...style, background: a.color }} />;
  return (
    <span className="mk human" title={title} style={{ ...style, background: a.color, fontSize: size * 0.36 }}>
      {a.badge}
    </span>
  );
}

const sizeFor = (w: number, big: boolean) => (big ? Math.round(30 + 22 * clamp((w - 0.6) / 2.2, 0, 1)) : 22);

/** Greedy lanes so markers at nearby positions stack instead of overlapping. */
function lanes<T>(items: T[], x: (t: T) => number, gap: number, max: number) {
  const ends: number[] = [];
  return items.map((it) => {
    const v = x(it);
    let l = ends.findIndex((e) => v - e >= gap);
    if (l === -1) l = ends.length < max ? ends.length : ends.indexOf(Math.min(...ends));
    ends[l] = v;
    return { it, lane: l };
  });
}

export function Stage({
  card,
  you,
  onYou,
  big = false,
  youLabel = "YOU",
}: {
  card: Card;
  you?: You | null;
  onYou?: (y: You) => void;
  big?: boolean;
  youLabel?: string;
}) {
  return card.outcomes.length === 2 ? (
    <Track card={card} you={you} onYou={onYou} big={big} youLabel={youLabel} />
  ) : (
    <Corners card={card} you={you} onYou={onYou} big={big} youLabel={youLabel} />
  );
}

/* ---------- binary: one track from No to Yes ---------- */

function Track({ card, you, onYou, big, youLabel }: { card: Card; you?: You | null; onYou?: (y: You) => void; big: boolean; youLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const stands = card.stands.filter((s) => !s.id.startsWith("source:") || big);
  const placed = lanes([...stands].sort((a, b) => b.probs[0] - a.probs[0]), (s) => (1 - s.probs[0]) * 100, big ? 7.5 : 6, big ? 3 : 2);
  const yesP = you ? (you.outcome === 0 ? you.conf : 1 - you.conf) : null;
  const laneH = big ? 46 : 24;
  const crowd = card.crowd?.[0];

  const setFromX = (clientX: number) => {
    if (!onYou || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const p = clamp(1 - (clientX - r.left) / r.width, 0.01, 0.99); // left edge = outcome 0 certain
    onYou(toYou(p));
  };

  return (
    <div className={`stage tline ${big ? "big" : "mini"} ${onYou ? "interactive" : ""}`}>
      <div className="crowdzone" style={{ height: laneH * (big ? 3 : 2) + (big ? 14 : 4) }}>
        {placed.map(({ it, lane }) => (
          <span key={it.id} className="stand" style={{ left: `${(1 - it.probs[0]) * 100}%`, bottom: lane * laneH }}>
            <Marker s={it} size={sizeFor(it.w, big)} />
          </span>
        ))}
      </div>
      <div
        className="rail"
        ref={ref}
        onPointerDown={(e) => {
          if (!onYou) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && setFromX(e.clientX)}
      >
        <div className="half yes" />
        <div className="half no" />
        <span className="end l">{card.outcomes[0].toUpperCase()}</span>
        <span className="end r">{card.outcomes[1].toUpperCase()}</span>
        <span className="mid" />
        <span className="pin" style={{ left: `${(1 - card.trust[0]) * 100}%` }}>
          <b>{pct(card.trust[0])}</b>
        </span>
        {crowd !== undefined && <span className="coin" style={{ left: `${(1 - crowd) * 100}%` }} title={`SUI pool ${pct(crowd)} ${card.outcomes[0]}`} />}
      </div>
      {onYou && (
        <div className="youzone">
          {yesP !== null ? (
            <button
              className="you"
              style={{ left: `${(1 - yesP) * 100}%` }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.01;
                if (e.key === "ArrowLeft") onYou(toYou(clamp(yesP + step, 0.01, 0.99)));
                if (e.key === "ArrowRight") onYou(toYou(clamp(yesP - step, 0.01, 0.99)));
              }}
              aria-label={`Your position: ${pct(yesP)} ${card.outcomes[0]}. Use arrow keys to move.`}
            >
              {youLabel} <b>{you!.outcome === 0 ? card.outcomes[0] : card.outcomes[1]} {pct(you!.conf)}</b>
            </button>
          ) : (
            <span className="youhint">tap the line to stand on it</span>
          )}
        </div>
      )}
      {big && (
        <div className="legend k">
          <span><i className="lg pinlg" /> Hindsight trust line <Help to="trust-line" /></span>
          {crowd !== undefined && <span><i className="lg coinlg" /> SUI pool</span>}
          <span>bigger = more trusted</span>
        </div>
      )}
    </div>
  );
}

const toYou = (p: number): You => (p >= 0.5 ? { outcome: 0, conf: clamp(p, 0.5, 0.99) } : { outcome: 1, conf: clamp(1 - p, 0.5, 0.99) });

/* ---------- three-way: pick your corner ---------- */

function Corners({ card, you, onYou, big, youLabel }: { card: Card; you?: You | null; onYou?: (y: You) => void; big: boolean; youLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const k = card.outcomes.length;
  const H = big ? 210 : 92;
  const yFor = (p: number) => clamp((p - 0.25) / 0.75, 0, 1) * (H - (big ? 46 : 24));
  const stands = card.stands.filter((s) => !s.id.startsWith("source:"));

  const setFromPoint = (x: number, y: number) => {
    if (!onYou || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const col = clamp(Math.floor(((x - r.left) / r.width) * k), 0, k - 1);
    const conf = clamp(0.34 + (1 - (y - r.top) / r.height) * 0.65, 0.34, 0.99);
    onYou({ outcome: col, conf });
  };

  return (
    <div className={`stage corners ${big ? "big" : "mini"} ${onYou ? "interactive" : ""}`}>
      <div
        className="cols"
        ref={ref}
        style={{ height: H, gridTemplateColumns: `repeat(${k}, 1fr)` }}
        onPointerDown={(e) => {
          if (!onYou) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setFromPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => e.buttons === 1 && setFromPoint(e.clientX, e.clientY)}
      >
        {card.outcomes.map((o, j) => {
          const mine = stands.filter((s) => s.probs.indexOf(Math.max(...s.probs)) === j);
          const placed = lanes([...mine].sort((a, b) => b.w - a.w), () => 0, 1, 99);
          const book = card.ref.bookmaker?.[j];
          return (
            <div className={`col ${you?.outcome === j ? "yours" : ""}`} key={o}>
              <div className="fill" style={{ height: `${card.trust[j] * 100}%`, ...(card.colors?.[j] ? { ["--c" as string]: card.colors[j]! } : {}) }} />
              <span className="colpct">{pct(card.trust[j])}</span>
              {book !== undefined && big && (
                <span className="booktick" style={{ bottom: `${book * 100}%` }} title={`DraftKings ${pct(book)}`}>
                  <img src="/sources/draftkings.svg" alt="" />
                </span>
              )}
              {placed.map(({ it, lane }) => (
                <span key={it.id} className="stand" style={{ left: `${18 + ((lane * 26) % 66)}%`, bottom: yFor(Math.max(...it.probs)) }}>
                  <Marker s={it} size={big ? sizeFor(it.w, true) - 6 : 20} />
                </span>
              ))}
              {onYou && you?.outcome === j && (
                <span className="you corner" style={{ bottom: yFor(you.conf) }}>
                  {youLabel} <b>{pct(you.conf)}</b>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="colnames" style={{ gridTemplateColumns: `repeat(${k}, 1fr)` }}>
        {card.outcomes.map((o, j) => (
          <span key={o}>
            {card.logos?.[j] && <img className="olog" src={card.logos[j]!} alt="" />}
            {j === 1 && k === 3 ? "Draw" : o}
          </span>
        ))}
      </div>
      {onYou && !you && <span className="youhint">tap a column to stand in it · higher = more sure</span>}
    </div>
  );
}
