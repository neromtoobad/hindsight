"use client";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { SlipPanel } from "@/components/BetSlip";
import { MarketCard, closes, defaultYou, leagueName, odds } from "@/components/MarketCard";
import { Stage } from "@/components/Line";
import { Race } from "@/components/Race";
import { MemoryFeed } from "@/components/Memory";
import { Ask } from "@/components/Ask";
import { X402Panel } from "@/components/X402";
import { useBook } from "@/components/useBook";
import { AGENTS, CATS, catColor, catIcon, pct, sourceOf, type Card } from "@/components/meta";

const ORDER = ["football", "politics", "sports", "crypto", "culture", "other"];

/** The market worth opening on: where Hindsight disagrees most with the public price, else the busiest. */
function featured(cards: Card[]) {
  const score = (c: Card) => (c.flag ? c.flag.gap * 10 : 0) + c.stands.filter((s) => AGENTS[s.id]).length + (c.closesAt - Date.now() < 24 * 3600_000 ? 1 : 0);
  return [...cards].sort((a, b) => score(b) - score(a))[0];
}

export default function Home() {
  const b = useBook();
  const [cat, setCat] = useState("all");
  const open = b.state?.open ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: open.length };
    for (const m of open) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [open]);
  const hero = featured(open);
  const pool = open.filter((m) => m.key !== hero?.key && (cat === "all" || m.category === cat));
  const soon = cat === "all" ? pool.filter((m) => m.closesAt - Date.now() < 24 * 3600_000) : [];
  const rest = pool.filter((m) => !soon.includes(m));
  const sections: [string, Card[]][] = [
    ...(soon.length ? [["🔥 Closing in the next 24 hours", soon] as [string, Card[]]] : []),
    ...ORDER.map((c) => [`${catIcon(c)} ${CATS.find((x) => x.id === c)?.label ?? c}`, rest.filter((m) => m.category === c)] as [string, Card[]]).filter(([, l]) => l.length),
  ];
  const sel = b.selection;

  return (
    <>
      <Header myBets={b.account ? b.openBets : undefined} onMyBets={() => { b.setTab("bets"); b.setSheet(true); document.getElementById("slip")?.scrollIntoView({ block: "start" }); }} />
      <main className="book2">
        <section className="mainc">
          {hero && (
            <div className="hero2" style={{ ["--c" as string]: catColor(hero.category) }}>
              <div className="herotext">
                <span className="league">
                  {catIcon(hero.category)} {leagueName(hero.league)} · closes in {closes(hero.closesAt)}
                </span>
                <h1>{hero.question}</h1>
                <p className="herosub">
                  {hero.flag ? (
                    <>
                      The agents put <b>{hero.outcomes[hero.flag.outcome]}</b> at <b>{pct(hero.trust[hero.flag.outcome])}</b>.{" "}
                      {sourceOf(hero.flag.source)?.name ?? hero.flag.source} says {pct(hero.ref[hero.flag.source][hero.flag.outcome])}. Who&apos;s right?
                    </>
                  ) : (
                    <>Everyone who called it is standing on the line. Bigger means more trusted. Drag yourself on.</>
                  )}
                </p>
                <div className="odds hero" style={{ gridTemplateColumns: `repeat(${hero.outcomes.length}, minmax(0, 1fr))` }}>
                  {hero.outcomes.map((o, j) => (
                    <button key={o} className={`oddbtn ${sel?.card.key === hero.key && sel.you.outcome === j ? "on" : ""}`} onClick={() => b.pick(hero, defaultYou(hero, j))}>
                      <span>{hero.outcomes.length === 3 && j === 1 ? "Draw" : o}</span>
                      <b>{odds(hero.trust[j])}</b>
                    </button>
                  ))}
                </div>
                <a className="k" href={`/m/${encodeURIComponent(hero.key)}`} style={{ textDecoration: "underline" }}>
                  read every call →
                </a>
              </div>
              <div className="herostage">
                <Stage card={hero} big you={sel?.card.key === hero.key ? sel.you : null} onYou={(y) => b.pick(hero, y)} />
              </div>
            </div>
          )}

          <nav className="catrail">
            {CATS.filter((c) => c.id === "all" || counts[c.id]).map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
                {c.icon}&nbsp;{c.id === "all" ? "Everything" : c.label}
                <span className="n">{counts[c.id] ?? 0}</span>
              </button>
            ))}
          </nav>

          {!b.state && <div className="empty">Loading markets…</div>}
          {sections.map(([title, list]) => (
            <section key={title} className="msec">
              <h2>{title}</h2>
              <div className="mgrid">
                {list.map((c) => (
                  <MarketCard key={c.key} card={c} held={b.held.get(c.key)} selected={sel?.card.key === c.key ? sel.you.outcome : null} onPick={(y) => b.pick(c, y)} />
                ))}
              </div>
            </section>
          ))}
        </section>

        <aside className={`side right ${b.sheet ? "sheet" : ""}`}>
          <button className="sheetclose" onClick={() => b.setSheet(false)}>
            ✕ Close
          </button>
          <SlipPanel tab={b.tab} setTab={b.setTab} selection={sel} setYou={b.setYou} clear={() => b.setSelection(null)} bets={b.bets} reloadBets={b.reload} toast={b.toast} />
          <Race rows={b.state?.leaderboard ?? []} you={b.account?.address} />
          <X402Panel feed={b.state?.x402} />
          <Ask />
          <MemoryFeed items={b.memory} stored={b.state?.stats.memories ?? 0} />
        </aside>
      </main>

      {!b.sheet && (sel || b.openBets > 0) && (
        <button className="slipbar" onClick={() => b.setSheet(true)}>
          <span>{sel ? `${sel.card.outcomes[sel.you.outcome]} · ${pct(sel.you.conf)} sure` : `My bets · ${b.openBets} open`}</span>
          <b>{sel ? "Bet slip →" : "View →"}</b>
        </button>
      )}
      {b.toastMsg && <div className="toast">{b.toastMsg}</div>}
    </>
  );
}
