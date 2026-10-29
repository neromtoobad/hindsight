import type { Category, MarketRec } from "../types";

const GAMMA = "https://gamma-api.polymarket.com";

interface GammaMarket {
  id: string;
  question: string;
  outcomes: string;
  outcomePrices: string;
  endDate: string;
  gameStartTime?: string;
  closed: boolean;
  active: boolean;
  volumeNum?: number;
  umaResolutionStatus?: string;
  slug: string;
}
interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  endDate: string;
  tags?: { slug: string }[];
  markets?: GammaMarket[];
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(GAMMA + path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`gamma ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

function categoryOf(tags: string[]): { category: Category; league: string } {
  const has = (...t: string[]) => t.find((x) => tags.includes(x));
  if (has("soccer", "epl", "premier-league", "champions-league")) return { category: "football", league: has("epl", "premier-league", "champions-league") ?? "soccer" };
  if (has("politics", "elections", "midterms")) return { category: "politics", league: has("midterms", "elections") ?? "politics" };
  if (has("crypto", "bitcoin", "ethereum", "crypto-prices")) return { category: "crypto", league: has("bitcoin", "ethereum", "solana") ?? "crypto" };
  if (has("sports", "games")) return { category: "sports", league: has("nba", "nfl", "mlb", "nhl", "tennis", "ufc", "f1", "golf") ?? "sports" };
  if (has("pop-culture", "culture", "entertainment", "movies", "music", "awards", "tech")) return { category: "culture", league: has("movies", "music", "awards", "tech") ?? "culture" };
  return { category: "other", league: tags[0] ?? "other" };
}

const parse = (s: string): string[] => {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
};

/** When picks stop. Games stop at kickoff, everything else half a day before the end date. */
function closesAt(m: GammaMarket, ev: GammaEvent): number {
  if (m.gameStartTime) return Date.parse(m.gameStartTime) - 2 * 60_000;
  const end = Date.parse(m.endDate || ev.endDate);
  return end - 12 * 3600_000;
}

const QUOTA: Record<Category, number> = { politics: 8, crypto: 6, sports: 8, culture: 5, other: 4, football: 3 };

/** Contested binary markets that close in the next few days, spread across categories. */
export async function discover(now = Date.now(), horizonDays = 8): Promise<MarketRec[]> {
  const min = new Date(now + 6 * 3600_000).toISOString();
  const max = new Date(now + horizonDays * 86400_000).toISOString();
  const events = await get<GammaEvent[]>(
    `/events?active=true&closed=false&limit=250&order=volume24hr&ascending=false&end_date_min=${min}&end_date_max=${max}`,
  );
  const taken: Record<string, number> = {};
  const out: MarketRec[] = [];
  for (const ev of events) {
    const tags = (ev.tags ?? []).map((t) => t.slug);
    const { category, league } = categoryOf(tags);
    if ((taken[category] ?? 0) >= QUOTA[category]) continue;
    const best = (ev.markets ?? [])
      .filter((m) => m.active && !m.closed)
      .map((m) => ({ m, outcomes: parse(m.outcomes), prices: parse(m.outcomePrices).map(Number) }))
      .filter((x) => x.outcomes.length === 2 && x.prices.length === 2)
      .filter((x) => x.prices[0] > 0.08 && x.prices[0] < 0.92)
      .filter((x) => closesAt(x.m, ev) > now + 3 * 3600_000 && Date.parse(x.m.endDate || ev.endDate) < now + horizonDays * 86400_000)
      .sort((a, b) => (b.m.volumeNum ?? 0) - (a.m.volumeNum ?? 0))[0];
    if (!best) continue;
    taken[category] = (taken[category] ?? 0) + 1;
    out.push({
      key: `pm:${best.m.id}`,
      source: "polymarket",
      sourceId: best.m.id,
      question: best.m.question,
      category,
      league,
      outcomes: best.outcomes,
      closesAt: closesAt(best.m, ev),
      ref: { polymarket: best.prices },
      status: "draft",
      pools: best.outcomes.map(() => "0"),
      url: `https://polymarket.com/event/${ev.slug}`,
    });
  }
  return out;
}

export async function prices(id: string): Promise<number[] | null> {
  const m = await get<GammaMarket>(`/markets/${id}`);
  const p = parse(m.outcomePrices).map(Number);
  return p.length ? p : null;
}

/** Winner index once Polymarket has settled, "void" if it settled 50/50, null while pending. */
export async function result(id: string): Promise<number | "void" | null> {
  const m = await get<GammaMarket>(`/markets/${id}`);
  if (!m.closed) return null;
  const p = parse(m.outcomePrices).map(Number);
  const w = p.findIndex((x) => x >= 0.99);
  if (w >= 0) return w;
  if (p.length === 2 && p.every((x) => Math.abs(x - 0.5) < 0.01)) return "void";
  return null;
}
