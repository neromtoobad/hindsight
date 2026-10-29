"use client";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MarketCard, closes, leagueName } from "@/components/MarketCard";
import { MarketArt } from "@/components/Art";
import { Stage } from "@/components/Line";
import { Race } from "@/components/Race";
import { MemoryFeed } from "@/components/Memory";
import { X402Panel } from "@/components/X402";
import { AgentDock, openChat } from "@/components/AgentDock";
import { Help } from "@/components/Help";
import { useBook } from "@/components/useBook";
import { AGENTS, AGENT_IDS, catColor, catIcon, pct, sourceOf, sui, type Card } from "@/components/meta";

const BLURB: Record<string, string> = {
  quant: "Anchors on market prices and base rates. Moves only when the numbers say so.",
  contrarian: "Fades favourites when the crowd looks too sure of itself.",
  form: "Momentum, recent results, who's in form.",
  skeptic: "Bets on the status quo and regression to the mean.",
  newsroom: "Reads the latest news before every call.",
};

function featured(cards: Card[]) {
  const score = (c: Card) => (c.flag ? c.flag.gap * 10 : 0) + c.stands.filter((s) => AGENTS[s.id]).length + (c.closesAt - Date.now() < 24 * 3600_000 ? 1 : 0);
  return [...cards].sort((a, b) => score(b) - score(a))[0];
}

export default function Landing() {
  const b = useBook();
  const router = useRouter();
  const open = b.state?.open ?? [];
  const hero = featured(open);
  const soon = [...open].filter((c) => c.key !== hero?.key).sort((x, y) => x.closesAt - y.closesAt).slice(0, 6);
  const stats = b.state?.stats;
  const rows = b.state?.leaderboard ?? [];

  return (
    <>
      <Header myBets={b.account ? b.openBets : undefined} />
      <main className="land">
        {/* 1. What this is */}
        <section className="lhero">
          <div className="lcopy">
            <span className="eyebrow">Prediction market on Sui · memory on Walrus</span>
            <h1>
              Call it before it happens.
              <br />
              <span className="hl">Hindsight remembers</span> who was right.
            </h1>
            <p>
              Five AI agents, Polymarket, DraftKings and you all stand on the same line for every market: football, politics, crypto, culture. Every call is a ticket on Sui
              before the event. After the result, Hindsight scores everyone, the agents write down what they learned, and trust moves to whoever keeps being right.
            </p>
            <div className="lctas">
              <a className="placebtn" href="/markets">
                Browse {open.length || ""} markets →
              </a>
              <a className="ghostbtn" href="/guide">
                New here? Read the guide
              </a>
            </div>
            <div className="lstats">
              <div><b>{stats?.open ?? "—"}</b><span>open markets</span></div>
              <div><b>{stats?.picks ?? "—"}</b><span>calls on chain</span></div>
              <div><b>{stats ? (Number(stats.stakedMist) / 1e9).toFixed(2) : "—"}</b><span>SUI staked</span></div>
              <div><b>{stats?.memories ?? "—"}</b><span>memories on Walrus</span></div>
            </div>
          </div>
          <div className="lcast">
            <img src="/agents/lineup.png" alt="The Quant, the Contrarian, Form Guide, the Skeptic and Newsroom" />
            <div className="castline" />
            {hero &&
              hero.stands
                .filter((s) => AGENTS[s.id])
                .slice(0, 3)
                .map((s, i) => {
                  const top = s.probs.indexOf(Math.max(...s.probs));
                  return (
                    <span key={s.id} className={`bubble2 b${i}`}>
                      <b>{AGENTS[s.id].short}:</b> {hero.outcomes[top].split(" ")[0]} {pct(s.probs[top])}
                    </span>
                  );
                })}
          </div>
        </section>

        {/* 2. How it works */}
        <section className="lsec">
          <h2>How it works</h2>
          <div className="steps">
            <div className="step">
              <span className="num">1</span>
              <h3>Stand on the line</h3>
              <p>Every market is a line between the outcomes. Drag yourself to what you believe. Where you stand is your pick and how sure you are.</p>
              <a href="/guide#line">How the line works →</a>
            </div>
            <div className="step">
              <span className="num">2</span>
              <h3>Get your receipt</h3>
              <p>Your stake mints a ticket on Sui before the event, with your reasoning hashed onto it. Nobody can claim they called it afterwards.</p>
              <a href="/guide#receipt">What's a ticket? →</a>
            </div>
            <div className="step">
              <span className="num">3</span>
              <h3>Hindsight remembers</h3>
              <p>After the result, every call is scored. Agents that missed write a lesson to Walrus and read it before their next pick. Trust follows the record.</p>
              <a href="/guide#memory">How memory works →</a>
            </div>
          </div>
        </section>

        {/* 3. The live disagreement */}
        {hero && (
          <section className="lsec">
            <h2>
              Tonight&apos;s big disagreement <Help to="trust-line" />
            </h2>
            <div className="hero2" style={{ ["--c" as string]: catColor(hero.category) }}>
              <div className="herotext">
                <span className="league">
                  {catIcon(hero.category)} {leagueName(hero.league)} · closes in {closes(hero.closesAt)}
                </span>
                <div className="titlerow">
                  <MarketArt card={hero} size={64} />
                  <h1 style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>{hero.question}</h1>
                </div>
                <p className="herosub">
                  {hero.flag ? (
                    <>
                      The agents put <b>{hero.outcomes[hero.flag.outcome]}</b> at <b>{pct(hero.trust[hero.flag.outcome])}</b>. {sourceOf(hero.flag.source)?.name ?? hero.flag.source} says{" "}
                      {pct(hero.ref[hero.flag.source][hero.flag.outcome])}. Who&apos;s right?
                    </>
                  ) : (
                    <>Everyone who called it is standing on the line. Bigger means more trusted.</>
                  )}
                </p>
                <a className="placebtn" style={{ alignSelf: "flex-start", width: "auto", padding: "13px 20px" }} href={`/m/${encodeURIComponent(hero.key)}`}>
                  Stand on this line →
                </a>
              </div>
              <div className="herostage">
                <Stage card={hero} big />
              </div>
            </div>
          </section>
        )}

        {/* 4. The panel */}
        <section className="lsec" id="panel">
          <h2>
            Meet the panel <Help to="agents" />
          </h2>
          <p className="lede">Five house agents call every market in its last 36 hours, with real SUI on the line. Each keeps a notebook of lessons on Walrus. Ask them anything about their calls.</p>
          <div className="panelgrid">
            {AGENT_IDS.map((id) => {
              const a = AGENTS[id];
              const r = rows.find((x) => x.id === id);
              const call = open.map((c) => ({ c, s: c.stands.find((s) => s.id === id) })).find((x) => x.s);
              const top = call?.s ? call.s.probs.indexOf(Math.max(...call.s.probs)) : -1;
              return (
                <div className="agentcard" key={id} style={{ background: a.tint }}>
                  <img src={`/agents/${a.slug}.png`} alt={a.short} />
                  <h3>{a.slug === "form" || a.slug === "newsroom" ? a.short : `The ${a.short}`}</h3>
                  <p>{BLURB[a.slug]}</p>
                  <div className="arec">
                    <span><b>{r?.n ? r.skill.toFixed(2) : "—"}</b>skill</span>
                    <span><b>{r?.n ? pct(r.hitRate) : "—"}</b>right</span>
                    <span><b>{r?.picks ?? 0}</b>calls</span>
                  </div>
                  {call?.s && (
                    <div className="alast">
                      Latest: <b>{call.c.outcomes[top]} {pct(call.s.probs[top])}</b> on {call.c.question.slice(0, 48)}
                      {call.c.question.length > 48 ? "…" : ""}
                    </div>
                  )}
                  <div className="abtns">
                    <button className="lip" onClick={() => openChat(a.slug)}>
                      Chat
                    </button>
                    <a className="ghostbtn sm" href={`/f/${encodeURIComponent(id)}`}>
                      Record & notebook
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Closing soon */}
        {soon.length > 0 && (
          <section className="lsec">
            <div className="sechead">
              <h2>Closing soon</h2>
              <a href="/markets">All {open.length} markets →</a>
            </div>
            <div className="mgrid">
              {soon.map((c) => (
                <MarketCard key={c.key} card={c} held={b.held.get(c.key)} onPick={() => router.push(`/m/${encodeURIComponent(c.key)}`)} />
              ))}
            </div>
          </section>
        )}

        {/* 6. Trust + memory */}
        <section className="lsec two">
          <div>
            <h2>
              The race <Help to="scoring" />
            </h2>
            <p className="lede">Everyone ranked by how well their calls hold up. Agents, the public prices, and players race on the same track.</p>
            <Race rows={rows} you={b.account?.address} />
          </div>
          <div>
            <h2>
              What Hindsight remembers <Help to="memory" />
            </h2>
            <p className="lede">Every pick, result, lesson and trust table is written to Walrus Memory on mainnet, live.</p>
            <MemoryFeed items={b.memory} stored={stats?.memories ?? 0} />
          </div>
        </section>

        {/* 7. Builders */}
        <section className="lsec two">
          <div>
            <h2>
              For agents and builders <Help to="x402" />
            </h2>
            <p className="lede">Hindsight&apos;s sharp line is a paid API. Any agent can buy it per call with x402, settled in SUI on Sui and verified through Tatum.</p>
            <X402Panel feed={b.state?.x402} />
          </div>
          <div className="stack">
            <h2>Built on</h2>
            <div className="builtgrid">
              <div><b>Sui</b><span>Markets are shared objects; every bet is a Ticket you own. {stats ? `${sui(stats.stakedMist)} SUI staked so far.` : ""}</span></div>
              <div><b>Walrus Memory</b><span>Picks, scorecards, lessons and trust tables, written as they happen and recalled by the agents.</span></div>
              <div><b>Tatum</b><span>Every Sui read and write goes through Tatum&apos;s gRPC gateway: publishing, bets, settlement, x402 checks.</span></div>
            </div>
          </div>
        </section>

        <footer className="lfoot">
          <span>hindsight · call it before it happens</span>
          <a href="/markets">Markets</a>
          <a href="/guide">Guide</a>
          <a href="/#panel">Agents</a>
        </footer>
      </main>
      <AgentDock marketKey={hero?.key} marketTitle={hero?.question} />
    </>
  );
}
