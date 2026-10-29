"use client";
import { use } from "react";
import { Header } from "@/components/Header";
import { SlipPanel } from "@/components/BetSlip";
import { Stage } from "@/components/Line";
import { Race } from "@/components/Race";
import { useBook } from "@/components/useBook";
import { AgentDock } from "@/components/AgentDock";
import { closes, defaultYou, leagueName, odds } from "@/components/MarketCard";
import { AGENTS, SOURCES, avatar, catColor, catIcon, pct, sui } from "@/components/meta";

export default function MarketPage({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent(use(params).key);
  const b = useBook();
  const all = [...(b.state?.open ?? []), ...(b.state?.awaiting ?? []), ...(b.state?.settled ?? [])];
  const card = all.find((c) => c.key === key);
  const sel = b.selection?.card.key === key ? b.selection : null;
  const isOpen = card?.status === "open" && card.closesAt > Date.now();

  return (
    <>
      <Header myBets={b.account ? b.openBets : undefined} onMyBets={() => { b.setTab("bets"); b.setSheet(true); }} />
      <main className="book2">
        <section className="mainc">
          <a className="k" href="/" style={{ textDecoration: "underline" }}>
            ← all markets
          </a>
          {!card && <div className="empty" style={{ marginTop: 12 }}>{b.state ? "This market isn't on the board." : "Loading…"}</div>}
          {card && (
            <>
              <div className="hero2 solo" style={{ ["--c" as string]: catColor(card.category) }}>
                <div className="herotext">
                  <span className="league">
                    {catIcon(card.category)} {leagueName(card.league)} · {isOpen ? `closes in ${closes(card.closesAt)}` : card.status === "resolved" ? `settled: ${card.outcomes[card.winner ?? 0]}` : card.status === "void" ? "void, stakes refunded" : "closed, waiting for the result"}
                  </span>
                  <h1>{card.question}</h1>
                </div>
                <Stage card={card} big you={sel?.you ?? null} onYou={isOpen ? (y) => b.pick(card, y) : undefined} />
                {isOpen && (
                  <div className="odds hero" style={{ gridTemplateColumns: `repeat(${card.outcomes.length}, minmax(0, 1fr))` }}>
                    {card.outcomes.map((o, j) => (
                      <button key={o} className={`oddbtn ${sel?.you.outcome === j ? "on" : ""}`} onClick={() => b.pick(card, defaultYou(card, j))}>
                        <span>{card.outcomes.length === 3 && j === 1 ? "Draw" : o}</span>
                        <b>{odds(card.trust[j])}</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <h2 className="h2">Every call on this market</h2>
              <div className="callgrid">
                {card.stands.map((s) => {
                  const top = s.probs.indexOf(Math.max(...s.probs));
                  const a = avatar(s.id);
                  const agent = AGENTS[s.id];
                  return (
                    <div className="callcard" key={s.id} style={{ background: agent?.tint ?? "#fff" }}>
                      <a className="who2" href={`/f/${encodeURIComponent(s.id)}`}>
                        {a.img ? <img src={a.img} alt="" className={SOURCES[s.id] ? "logo" : ""} /> : <span className="badge2" style={{ background: a.color }}>{a.badge}</span>}
                        <span>
                          <b>{s.name}</b>
                          <small>{s.kind === "agent" ? "house agent" : s.kind === "source" ? "public price" : "player"} · trusted {s.w.toFixed(1)}×</small>
                        </span>
                      </a>
                      <div className="callbar">
                        {card.outcomes.map((o, j) => (
                          <span key={o} className={j === top ? "top" : ""}>
                            {card.outcomes.length === 3 && j === 1 ? "Draw" : o.split(" ")[0]} <b>{pct(s.probs[j])}</b>
                          </span>
                        ))}
                      </div>
                      {s.reasoning && <p className="callwhy">{s.reasoning}</p>}
                      {s.lesson && (
                        <p className="lessonchip">
                          <b>Lesson applied:</b> {s.lesson}
                        </p>
                      )}
                      {isOpen && agent && (
                        <button className="tailbtn" onClick={() => b.pick(card, { outcome: top, conf: Math.max(card.outcomes.length === 2 ? 0.5 : 0.34, Math.min(0.99, s.probs[top])) })}>
                          Tail {agent.short} · {card.outcomes[top]} {pct(s.probs[top])}
                        </button>
                      )}
                    </div>
                  );
                })}
                {card.stands.length === 0 && <p className="hint2">No calls yet. The agents call each market in its last 36 hours.</p>}
              </div>

              <div className="facts">
                <div>
                  <span className="k">Trust line</span>
                  <b>{card.outcomes.map((o, j) => `${o.split(" ")[0]} ${pct(card.trust[j])}`).join(" · ")}</b>
                </div>
                <div>
                  <span className="k">SUI pool</span>
                  <b>{sui(card.poolMist.reduce((a, x) => a + BigInt(x), 0n))} SUI{card.crowd ? ` · ${card.outcomes.map((o, j) => `${o.split(" ")[0]} ${pct(card.crowd![j])}`).join(" · ")}` : ""}</b>
                </div>
                <div>
                  <span className="k">On chain</span>
                  <a href={`https://suiscan.xyz/mainnet/object/${card.onchainId}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                    market object ↗
                  </a>
                </div>
                {card.url && (
                  <div>
                    <span className="k">Resolves from</span>
                    <a href={card.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                      {card.key.startsWith("pm:") ? "Polymarket" : "ESPN"} ↗
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <aside className={`side right ${b.sheet ? "sheet" : ""}`}>
          <button className="sheetclose" onClick={() => b.setSheet(false)}>
            ✕ Close
          </button>
          <SlipPanel tab={b.tab} setTab={b.setTab} selection={b.selection} setYou={b.setYou} clear={() => b.setSelection(null)} bets={b.bets} reloadBets={b.reload} toast={b.toast} />
          <Race rows={b.state?.leaderboard ?? []} you={b.account?.address} />
        </aside>
      </main>
      {!b.sheet && sel && (
        <button className="slipbar" onClick={() => b.setSheet(true)}>
          <span>
            {sel.card.outcomes[sel.you.outcome]} · {pct(sel.you.conf)} sure
          </span>
          <b>Bet slip →</b>
        </button>
      )}
      <AgentDock marketKey={card?.key} marketTitle={card?.question} />
      {b.toastMsg && <div className="toast">{b.toastMsg}</div>}
    </>
  );
}
