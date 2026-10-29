import type { MarketRec } from "../types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
export const LEAGUES: Record<string, string> = {
  "eng.1": "Premier League",
  "uefa.champions": "Champions League",
  "esp.1": "La Liga",
  "ita.1": "Serie A",
  "ger.1": "Bundesliga",
  "fra.1": "Ligue 1",
  "uefa.europa": "Europa League",
};

/** American odds to raw implied probability. */
function implied(american?: string | number): number | null {
  if (american === undefined || american === null || american === "") return null;
  const a = Number(String(american).replace("+", ""));
  if (!Number.isFinite(a) || a === 0) return null;
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100);
}

/** Bookmaker line without the vig: [home, draw, away]. */
function bookProbs(odds: any): number[] | null {
  const ml = odds?.moneyline;
  const h = implied(ml?.home?.close?.odds ?? ml?.home?.open?.odds);
  const d = implied(ml?.draw?.close?.odds ?? ml?.draw?.open?.odds ?? odds?.drawOdds?.moneyLine);
  const a = implied(ml?.away?.close?.odds ?? ml?.away?.open?.odds);
  if (h === null || d === null || a === null) return null;
  const s = h + d + a;
  return [h / s, d / s, a / s];
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

export async function discover(now = Date.now(), days = 5): Promise<MarketRec[]> {
  const out: MarketRec[] = [];
  for (const league of Object.keys(LEAGUES)) {
    for (let i = 0; i < days; i++) {
      const r = await fetch(`${BASE}/${league}/scoreboard?dates=${ymd(now + i * 86400_000)}`);
      if (!r.ok) continue;
      const data = (await r.json()) as any;
      for (const e of data.events ?? []) {
        const c = e.competitions?.[0];
        if (c?.status?.type?.state !== "pre") continue;
        const home = c.competitors.find((x: any) => x.homeAway === "home");
        const away = c.competitors.find((x: any) => x.homeAway === "away");
        const kickoff = Date.parse(e.date);
        if (kickoff < now + 3 * 3600_000) continue;
        const book = bookProbs(c.odds?.[0]);
        const hex = (t: any) => (t?.color ? `#${t.color}` : null);
        out.push({
          key: `espn:${e.id}`,
          source: "espn",
          sourceId: `${league}/${e.id}`,
          question: `${home.team.displayName} vs ${away.team.displayName} (${LEAGUES[league]})`,
          category: "football",
          league,
          outcomes: [home.team.displayName, "Draw", away.team.displayName],
          closesAt: kickoff - 2 * 60_000,
          ref: book ? { bookmaker: book } : {},
          status: "draft",
          pools: ["0", "0", "0"],
          url: `https://www.espn.com/soccer/match/_/gameId/${e.id}`,
          logos: [home.team.logo ?? null, null, away.team.logo ?? null],
          colors: [hex(home.team), null, hex(away.team)],
          leagueLogo: data.leagues?.[0]?.logos?.[0]?.href,
        });
      }
    }
  }
  return out;
}

export async function refreshOdds(sourceId: string): Promise<number[] | null> {
  const [league, id] = sourceId.split("/");
  const r = await fetch(`${BASE}/${league}/summary?event=${id}`);
  if (!r.ok) return null;
  const s = (await r.json()) as any;
  return bookProbs(s.pickcenter?.[0] ?? s.odds?.[0]);
}

/** 0 home, 1 draw, 2 away; "void" if postponed or cancelled; null while pending. */
export async function result(sourceId: string): Promise<number | "void" | null> {
  const [league, id] = sourceId.split("/");
  const r = await fetch(`${BASE}/${league}/summary?event=${id}`);
  if (!r.ok) return null;
  const s = (await r.json()) as any;
  const comp = s.header?.competitions?.[0];
  const st = comp?.status?.type;
  if (!st) return null;
  if (/POSTPONED|CANCELED|ABANDONED/.test(st.name ?? "")) return "void";
  if (!st.completed) return null;
  const home = comp.competitors.find((x: any) => x.homeAway === "home");
  const away = comp.competitors.find((x: any) => x.homeAway === "away");
  const h = Number(home.score);
  const a = Number(away.score);
  return h > a ? 0 : h === a ? 1 : 2;
}

/** Crests and colours for a fixture already on the board (backfill). */
export async function art(sourceId: string): Promise<{ logos: (string | null)[]; colors: (string | null)[] } | null> {
  const [league, id] = sourceId.split("/");
  const r = await fetch(`${BASE}/${league}/summary?event=${id}`);
  if (!r.ok) return null;
  const s = (await r.json()) as any;
  const comps = s.header?.competitions?.[0]?.competitors ?? [];
  const home = comps.find((x: any) => x.homeAway === "home")?.team;
  const away = comps.find((x: any) => x.homeAway === "away")?.team;
  if (!home || !away) return null;
  const logo = (t: any) => t.logos?.[0]?.href ?? t.logo ?? null;
  const hex = (t: any) => (t.color ? `#${t.color}` : null);
  return { logos: [logo(home), null, logo(away)], colors: [hex(home), null, hex(away)] };
}
