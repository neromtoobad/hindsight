"use client";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Stage, type You } from "@/components/Line";
import { AgentDock, openChat } from "@/components/AgentDock";
import { AGENTS, AGENT_IDS, pct, type Card } from "@/components/meta";

const TOC: [string, string][] = [
  ["start", "Hindsight in one minute"],
  ["prediction-markets", "What's a prediction market?"],
  ["odds", "Odds and chances"],
  ["line", "Standing on the line"],
  ["scoring", "How everyone is scored"],
  ["trust-line", "The trust line"],
  ["agents", "The agents"],
  ["sources", "Polymarket and DraftKings"],
  ["pool", "The pool and “to win”"],
  ["receipt", "Your receipt on Sui"],
  ["memory", "What Walrus remembers"],
  ["x402", "Agents paying agents"],
  ["wallet", "Getting started"],
  ["glossary", "Glossary"],
];

// A practice market for the demo: nothing here touches the chain.
const DEMO: Card = {
  key: "demo",
  question: "Will it rain in Lagos tomorrow?",
  category: "other",
  league: "practice",
  outcomes: ["Yes", "No"],
  closesAt: Date.now() + 86400_000,
  status: "open",
  winner: undefined,
  url: undefined,
  onchainId: undefined,
  ref: { polymarket: [0.62, 0.38] },
  trust: [0.66, 0.34],
  crowd: [0.58, 0.42],
  poolMist: ["5800000000", "4200000000"],
  picks: 4,
  flag: null,
  icon: null,
  logos: null,
  colors: null,
  leagueLogo: null,
  stands: [
    { id: "agent:quant", name: "The Quant", kind: "agent", avatar: null, tint: null, w: 2.1, probs: [0.64, 0.36], reasoning: null, lesson: null },
    { id: "agent:contrarian", name: "The Contrarian", kind: "agent", avatar: null, tint: null, w: 0.8, probs: [0.45, 0.55], reasoning: null, lesson: null },
    { id: "agent:skeptic", name: "The Skeptic", kind: "agent", avatar: null, tint: null, w: 1.4, probs: [0.7, 0.3], reasoning: null, lesson: null },
    { id: "source:polymarket", name: "Polymarket", kind: "source", avatar: null, tint: null, w: 1.6, probs: [0.62, 0.38], reasoning: null, lesson: null },
  ],
} as unknown as Card;

function Demo() {
  const [you, setYou] = useState<You>({ outcome: 0, conf: 0.7 });
  const p = you.conf;
  const right = 2 * (1 - p) ** 2;
  const wrong = 2 * p ** 2;
  const pick = DEMO.outcomes[you.outcome];
  return (
    <div className="demo">
      <div className="demohead">
        <span className="k">Practice line · drag yourself</span>
        <b>{DEMO.question}</b>
      </div>
      <Stage card={DEMO} big you={you} onYou={setYou} />
      <div className="demonums">
        <div>
          <span>You&apos;re backing</span>
          <b>
            {pick}, {pct(p)} sure
          </b>
        </div>
        <div>
          <span>Fair odds for {pick}</span>
          <b>{(1 / DEMO.trust[you.outcome]).toFixed(2)}</b>
        </div>
        <div>
          <span>If {pick} happens, your score</span>
          <b className="ok">{right.toFixed(2)}</b>
        </div>
        <div>
          <span>If it doesn&apos;t, your score</span>
          <b className="bad">{wrong.toFixed(2)}</b>
        </div>
      </div>
      <p className="hint2">Lower scores are better. A coin flip (50%) scores 0.50 either way. Being 99% sure and wrong scores 1.96, so only go far out on the line when you really know.</p>
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => <p>{children}</p>;

export default function Guide() {
  return (
    <>
      <Header />
      <main className="guide">
        <nav className="toc">
          <span className="k">Guide</span>
          {TOC.map(([id, t]) => (
            <a key={id} href={`#${id}`}>
              {t}
            </a>
          ))}
        </nav>
        <article className="gbody">
          <section id="start">
            <span className="eyebrow">The Hindsight guide</span>
            <h1>Everything on the screen, explained.</h1>
            <P>
              Hindsight is a prediction market. You pick what you think will happen, say how sure you are, and back it with a little SUI. After the event, everyone who made a call (you,
              five AI agents, and the public prices from Polymarket and DraftKings) gets scored. Hindsight remembers every call and every result, so over time it learns whose word is
              worth the most.
            </P>
            <Demo />
          </section>

          <section id="prediction-markets">
            <h2>What&apos;s a prediction market?</h2>
            <P>
              A market where the thing being traded is an outcome: “Chelsea beat Man United”, “Bitcoin dips to $77,500 this month”, “Democrats control the Senate”. Each outcome has a
              price between 0 and 100%, which you can read as the crowd&apos;s chance that it happens. When the event is over, the outcome that happened pays out and the rest pay
              nothing.
            </P>
            <P>Hindsight adds one thing most markets don&apos;t have: a memory of who called it right, used to decide whose opinion counts the most next time.</P>
          </section>

          <section id="odds">
            <h2>Odds and chances</h2>
            <P>
              The buttons show <b>decimal odds</b>: how much a fair book would pay back for every 1 SUI you stake. They are just 1 divided by the chance. A 50% chance is odds of 2.00;
              a 25% chance is 4.00; an 80% chance is 1.25.
            </P>
            <div className="oddsrow">
              {[0.8, 0.5, 0.25, 0.1].map((x) => (
                <div key={x}>
                  <b>{pct(x)}</b>
                  <span>chance</span>
                  <b className="mono">{(1 / x).toFixed(2)}</b>
                  <span>odds</span>
                </div>
              ))}
            </div>
            <P>The odds on Hindsight come from the trust line (below), not from a bookmaker taking a cut.</P>
          </section>

          <section id="line">
            <h2>Standing on the line</h2>
            <P>
              Every two-way market is a line. The left end means “certainly the first outcome”, the right end “certainly the second”, and the middle is a coin flip. The agents and
              the public prices stand where they think the truth is. You drag yourself onto it: which side of the middle you stand on is your pick, and how far you go is how sure you
              are.
            </P>
            <P>
              Football has three outcomes (home, draw, away), so it gets three columns instead of a line. Tap a column to stand in it; the higher you stand, the more sure you are. Each
              column is filled to Hindsight&apos;s current chance for that outcome.
            </P>
            <P>On the line, the lime flag is Hindsight&apos;s trust line and the gold coin is where the SUI pool sits.</P>
          </section>

          <section id="scoring">
            <h2>How everyone is scored</h2>
            <P>
              Calls are scored with the <b>Brier score</b>: how far your chances were from what actually happened. 0 is perfect, 0.50 is what a coin flip gets on a two-way market, and
              it punishes confident misses hard. Try it on the practice line at the top.
            </P>
            <P>
              Scores add up per topic (“politics”, “football/Serie A”…). The race shows everyone&apos;s <b>skill</b>: how much better than a coin flip they are, where 0 means no
              better, above 0 means sharper, below 0 means worse. Settled bets show their score on your receipt.
            </P>
          </section>

          <section id="trust-line">
            <h2>The trust line</h2>
            <P>
              Hindsight&apos;s own forecast. It is an average of everyone&apos;s calls on a market, weighted by their track record in that kind of market. A forecaster with a long, sharp
              record in Serie A counts several times more on a Serie A match than a newcomer; one who keeps missing fades out. On the line, bigger characters are the ones with more
              weight.
            </P>
            <P>When the trust line and Polymarket or DraftKings are far apart, the card shows a red flag. Those are the interesting markets: somebody is wrong.</P>
          </section>

          <section id="agents">
            <h2>The agents</h2>
            <P>Five AI forecasters with different styles. They each have a Sui wallet and stake real SUI on every market in the last 36 hours before it closes.</P>
            <div className="gagents">
              {AGENT_IDS.map((id) => (
                <button key={id} className="gagent" style={{ background: AGENTS[id].tint }} onClick={() => openChat(AGENTS[id].slug)}>
                  <img src={`/agents/${AGENTS[id].slug}-head.png`} alt="" />
                  <span>
                    <b>{AGENTS[id].short}</b>
                    <small>Tap to chat</small>
                  </span>
                </button>
              ))}
            </div>
            <P>
              After a bad miss, an agent writes a one-line lesson to its notebook on Walrus. Before every new pick it reads the lessons that fit the market, and tells you when it applied
              one (look for the “LESSON ✓” sticker). You can chat with any of them about their calls; they explain their thinking but never tell you what to bet.
            </P>
          </section>

          <section id="sources">
            <h2>Polymarket and DraftKings</h2>
            <P>
              The public prices. Polymarket is a large prediction market; DraftKings is a sportsbook whose football lines we read from ESPN, with the bookmaker&apos;s margin removed. They
              stand on the line too, and they are scored like everyone else, so you can see whether the agents beat the market over time.
            </P>
          </section>

          <section id="pool">
            <h2>The pool and “to win”</h2>
            <P>
              Hindsight is a <b>pool</b> (parimutuel) market. Everyone&apos;s stakes on a market go into one pot. When it settles, the people who backed the winning outcome split the
              pot in proportion to what they staked, after a 2% fee. That&apos;s why “to win” on your slip moves: it depends on how much is on each side when the market closes.
            </P>
            <P>If an event is cancelled, or nobody backed the outcome that happened, the market is void and everyone gets their stake back.</P>
          </section>

          <section id="receipt">
            <h2>Your receipt on Sui</h2>
            <P>
              Each bet mints a <b>Ticket</b> object in your wallet. It records the outcome, your stake, the exact time (always before the market closed), and a fingerprint (hash) of
              your reasoning. That&apos;s your receipt: nobody, including us, can change it or pretend they called it afterwards. When you win, “Claim winnings” pays you and the ticket
              stays as the record. Every market is also a public object you can inspect on a Sui explorer.
            </P>
          </section>

          <section id="memory">
            <h2>What Walrus remembers</h2>
            <P>Walrus Memory is long-term storage for AI on Sui&apos;s Walrus network. Hindsight writes five kinds of memories there, live:</P>
            <ul>
              <li><b>picks</b>: every call with its reasoning, before the event;</li>
              <li><b>scorecards</b>: every result and how each call did;</li>
              <li><b>lessons</b>: what each agent decided to do differently after a miss;</li>
              <li><b>trust</b>: who to trust on which topic, updated as results come in;</li>
              <li><b>you</b>: what you follow, so the app learns your interests.</li>
            </ul>
            <P>The agents and “Ask Hindsight” read these back by meaning, not keywords, which is how the app gets sharper every week instead of starting from zero.</P>
          </section>

          <section id="x402">
            <h2>Agents paying agents</h2>
            <P>
              Other AI agents can buy Hindsight&apos;s trust line for any market through a paid API. Ask for it and the server answers “402 Payment Required” with a price (0.01 SUI);
              the agent pays on Sui, sends the payment id back, and Hindsight checks it through Tatum before answering. This is the x402 standard, settled in SUI.
            </P>
          </section>

          <section id="wallet">
            <h2>Getting started</h2>
            <ol>
              <li>Install a Sui wallet such as Slush (browser extension or slush.app).</li>
              <li>Get some SUI: buy it on an exchange and withdraw on the Sui network. 0.1 SUI is plenty to try; the smallest bet is 0.01 SUI plus a tiny gas fee.</li>
              <li>Connect the wallet (top right), make your character, and stand on a line.</li>
            </ol>
          </section>

          <section id="glossary">
            <h2>Glossary</h2>
            <dl className="gloss">
              <dt>Trust line</dt>
              <dd>Hindsight&apos;s forecast, weighted by everyone&apos;s track record.</dd>
              <dt>Odds</dt>
              <dd>1 ÷ chance. What 1 SUI pays at a fair price.</dd>
              <dt>How sure</dt>
              <dd>Your confidence. It&apos;s what you&apos;re scored on.</dd>
              <dt>Brier score</dt>
              <dd>Distance between your chances and what happened. Lower is better.</dd>
              <dt>Skill</dt>
              <dd>How much better than a coin flip someone&apos;s calls are, per topic.</dd>
              <dt>Pool</dt>
              <dd>All stakes on a market; winners split it minus 2%.</dd>
              <dt>Ticket</dt>
              <dd>Your bet as an object on Sui: the receipt.</dd>
              <dt>Tail</dt>
              <dd>Copy an agent&apos;s stance into your slip in one tap.</dd>
              <dt>Void</dt>
              <dd>Cancelled market; every stake is refunded.</dd>
              <dt>Walrus Memory</dt>
              <dd>Where every call, result and lesson is stored for the long run.</dd>
            </dl>
            <a className="placebtn" href="/markets" style={{ display: "inline-block", width: "auto", padding: "13px 22px", marginTop: 12 }}>
              Go to the markets →
            </a>
          </section>
        </article>
      </main>
      <AgentDock />
    </>
  );
}
