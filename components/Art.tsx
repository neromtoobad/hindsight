"use client";
import { catIcon, type Card } from "./meta";

/** The market's face: two crests for a fixture, the official image for everything else. */
export function MarketArt({ card, size = 52 }: { card: Card; size?: number }) {
  const home = card.logos?.[0];
  const away = card.logos?.[card.outcomes.length - 1];
  if (home && away)
    return (
      <span className="crests" style={{ width: size * 1.45, height: size }}>
        <img src={home} alt={card.outcomes[0]} style={{ width: size * 0.82, height: size * 0.82 }} />
        <img src={away} alt={card.outcomes[card.outcomes.length - 1]} style={{ width: size * 0.82, height: size * 0.82 }} />
      </span>
    );
  if (card.icon) return <img className="micon" src={card.icon} alt="" style={{ width: size, height: size }} />;
  return (
    <span className="micon blank" style={{ width: size, height: size, fontSize: size * 0.48 }}>
      {catIcon(card.category)}
    </span>
  );
}

/** A small crest for one outcome (football teams), or nothing. */
export function OutcomeLogo({ card, j, size = 18 }: { card: Card; j: number; size?: number }) {
  const src = card.logos?.[j];
  if (!src) return null;
  return <img className="olog" src={src} alt="" style={{ width: size, height: size }} />;
}
