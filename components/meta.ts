import type { marketCard, marketDetail, leaderboard, pickView } from "@/lib/views";

export type Card = ReturnType<typeof marketCard>;
export type Detail = ReturnType<typeof marketDetail>;
export type Row = ReturnType<typeof leaderboard>[number];
export type PickV = ReturnType<typeof pickView>;

export const CATS: { id: string; label: string; icon: string }[] = [
  { id: "all", label: "Closing soon", icon: "🔥" },
  { id: "politics", label: "Politics", icon: "🗳" },
  { id: "football", label: "Football", icon: "⚽" },
  { id: "sports", label: "Sports", icon: "🏀" },
  { id: "crypto", label: "Crypto", icon: "₿" },
  { id: "culture", label: "Culture", icon: "🎬" },
  { id: "other", label: "Other", icon: "🌍" },
];

export const catColor = (c: string) => `var(--${["politics", "football", "sports", "crypto", "culture"].includes(c) ? c : "other"})`;
export const catIcon = (c: string) => CATS.find((x) => x.id === c)?.icon ?? "🌍";

export const AGENTS: Record<string, { slug: string; short: string; tint: string; color: string }> = {
  "agent:quant": { slug: "quant", short: "Quant", tint: "var(--t-quant)", color: "#5b5bf0" },
  "agent:contrarian": { slug: "contrarian", short: "Contrarian", tint: "var(--t-contrarian)", color: "#ef4444" },
  "agent:form": { slug: "form", short: "Form Guide", tint: "var(--t-form)", color: "#12a36b" },
  "agent:skeptic": { slug: "skeptic", short: "Skeptic", tint: "var(--t-skeptic)", color: "#8d8a82" },
  "agent:newsroom": { slug: "newsroom", short: "Newsroom", tint: "var(--t-newsroom)", color: "#f59e0b" },
};
export const AGENT_IDS = Object.keys(AGENTS);

export const SOURCES: Record<string, { badge: string; color: string }> = {
  "source:polymarket": { badge: "PM", color: "#7b61ff" },
  "source:bookmaker": { badge: "BK", color: "#0f766e" },
};

export function avatar(id: string): { img?: string; badge?: string; color: string } {
  if (AGENTS[id]) return { img: `/agents/${AGENTS[id].slug}-head.png`, color: AGENTS[id].color };
  if (SOURCES[id]) return SOURCES[id];
  const hue = parseInt(id.slice(2, 8) || "0", 16) % 360;
  return { badge: id.slice(2, 4), color: `hsl(${hue} 45% 32%)` };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const sui = (mist?: string | bigint) => (Number(BigInt(mist ?? 0)) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 });
export const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/** Parimutuel multiple for a fresh stake on outcome i (2% fee), counting the stake itself. */
export function payout(pools: string[], i: number, stakeMist: bigint) {
  const p = pools.map((x) => BigInt(x));
  const total = p.reduce((a, b) => a + b, 0n) + stakeMist;
  const mine = p[i] + stakeMist;
  return (Number(total) * 0.98) / Number(mine);
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
