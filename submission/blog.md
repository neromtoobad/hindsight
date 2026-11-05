<!--
"The first three days" is a snapshot from Oct 31; "One week in" is from Nov 5 (api/state + /api/forecasters/<id>).
-->

# Hindsight: a prediction market that remembers who was right

Everybody called it. That's the problem with predictions: after the result, the people who were wrong go quiet and the people who were right get louder, and nobody keeps the receipts. Pundits, tipsters, the group chat, the AI model you asked last week. You can't tell who's actually good because nobody's record survives.

Hindsight keeps the record. It's a prediction market on Sui where five AI agents, the public prices from Polymarket and DraftKings, and real players all stand on the same line for every market. Every call becomes a ticket on chain before the event. After the result, Hindsight scores everyone, the agents that missed write down what they learned, and the next time a market opens, trust has already moved toward whoever keeps being right.

It's live at [hindsight.nerom.site](https://hindsight.nerom.site), running on Sui mainnet with real SUI. The code is at [github.com/neromtoobad/hindsight](https://github.com/neromtoobad/hindsight).

![The panel: The Quant, The Contrarian, Form Guide, The Skeptic and Newsroom](/agents/lineup.png)

## What it does

Every market is a line between its outcomes. You drag yourself along it to what you believe; where you stand is both your pick and how sure you are. Stake some SUI from your wallet and the contract mints you a `Ticket`, an object you own, with a sha256 hash of your reasoning written onto it. That hash is the point. You can't edit your reasoning after kickoff, and you can't claim you called something you didn't.

The markets come from two places. A worker pulls live Polymarket markets across politics, crypto, sports and culture, and ESPN football fixtures from seven competitions (Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1, Europa League) with DraftKings moneylines, vig removed. In its first three days it opened 55 markets across football, politics, crypto, esports, the NBA and the NFL.

Then there's the panel. Five house agents, each with its own Sui wallet and its own way of being wrong:

- **The Quant** anchors on prices and base rates and only moves when the numbers say so.
- **The Contrarian** fades favourites when the crowd looks too sure.
- **Form Guide** cares about momentum and recent results.
- **The Skeptic** backs the status quo and expects regression to the mean.
- **Newsroom** searches the web before every call.

They call every market in its last 36 hours and put real SUI behind it. You can see where each one stands on the line, read why, tail the one you trust with a tap, or open a chat with any of them and argue about it.

A real example from this week: a Counter-Strike BO3, Inner Circle vs Astralis. Polymarket had Astralis around 58%. Four agents sat within a point or two of that. Newsroom went and looked, found that Astralis was fielding a substitute in a LAN lower-bracket semi-final, and shaded toward Inner Circle because of it. Astralis won anyway. That's the kind of disagreement Hindsight exists to score.

## How it uses Walrus Memory

Walrus Memory is where Hindsight keeps everything that has to outlive a single market. Every write goes to mainnet through the MemWal relayer, sorted into namespaces:

| Namespace | What goes in | Who reads it back |
|---|---|---|
| `picks` | every call, player or agent: market, outcome, confidence, reasoning, tx digest | the public audit trail |
| `scorecards` | the result and Brier score of every call on a settled market | the agents, before every pick and in chat |
| `lessons:<agent>` | what that agent got wrong and what it'll do next time | that agent, before every pick and in chat |
| `credibility` | "who to trust on football/eng.1" snapshots after each settle | the public record of how trust moved |
| `user:<address>` | what a player follows and picks | that player's history |

The read side matters more than the write side. Before an agent calls a market, Hindsight recalls the five lessons from its notebook most relevant to that market and its four most recent scorecards, and puts them in front of the model along with the prices. The agent doesn't start fresh every time. It starts from what it learned the last time it was wrong about something similar.

By October 31 Hindsight had written 361 memories to Walrus mainnet, up from 50 on day one. By November 5 it was past 1,900.

## How it uses Tatum

Every Sui read and write in Hindsight goes through Tatum's Sui mainnet gateway: publishing the Move package, opening markets, building bet and claim transactions for players' wallets, the agents' own bets, resolution, payouts, reading events back to confirm every bet landed, and checking agent balances before they spend a Claude call on a pick they can't afford.

Getting there took a detour. My first attempt used Tatum's JSON-RPC endpoint and got 404s. Sui is moving off JSON-RPC, and Tatum's Sui gateway speaks native gRPC, so Hindsight uses `SuiGrpcClient` from `@mysten/sui` with a `GrpcTransport` pointed at `sui-mainnet-grpc.gateway.tatum.io:443` and the API key in an `x-api-key` header. Once that clicked, everything else worked through it. The other surprise was rate limits: the worker opening 30 markets at once got HTTP 429s, so every Tatum call goes through a small retry helper with exponential backoff, and market creation is paced at one every 800ms.

Then, on November 5, the gateway started answering every call with HTTP 402: "Your plan limit has been exceeded." The free plan is 100,000 credits for the life of the account, and Hindsight had used all of them in a week. Part of that was my own bug. All five agents had run out of gas, and the worker kept retrying their winning claims every ten minutes, about 4,400 failed attempts overnight, each one still costing node calls. I couldn't pay for a plan, so `lib/sui.ts` now sends every call to Tatum first and falls back to Sui's public fullnode while Tatum says 402, trying Tatum again every 30 minutes. The worker no longer retries claims for an agent with no gas; it sends that agent a 0.015 SUI grant instead, and the agent collects its winnings and goes back to betting. Everything from October 29 to November 5 ran through Tatum, and the site says which node is serving calls right now.

One more Sui detail that cost me an evening: the SUI I bridged arrived as an address balance, not as coin objects, so the textbook `splitCoins(tx.gas, ...)` failed. Switching stakes and transfers to `coinWithBalance` fixed it.

## Agents paying agents

Hindsight's trust line is useful to other agents, so it's for sale. `GET /api/sharp/<market>` answers **402 Payment Required** with an x402 `accepts` entry: 0.01 SUI to the treasury on `sui:mainnet`. The buyer pays, retries with an `X-PAYMENT` header carrying the transaction digest, and Hindsight verifies the payment through Tatum before serving the line. It checks the balance change actually landed at the treasury, the amount, the network, that the transaction is under 15 minutes old, and that the digest hasn't been spent before.

The first paid call came from inside the house. Newsroom bought the sharp line on the 2026 Senate control market for 0.01 SUI ([tx](https://suiscan.xyz/mainnet/tx/4FGQ5m4yjvKWxsBdsNoDQNAVgZJBhj2r4T23J2jdZhpU)). I then threw bad payments at it: a replayed digest, a malformed header, the wrong network, a made-up digest, a stale transaction, a payment to the wrong address. Each one got rejected.

## How it learned over time

This is the part a prediction market can't fake, because it needs results.

Every call is scored with a Brier score once the market settles. Hindsight normalizes it against a coin flip, so a skill of 0 means "no better than guessing" and anything above 0 is real. Skill is tracked per scope (overall, per category, per league), and a forecaster's weight on a market comes from the most specific scope where it has at least three scored calls: `exp(4 · skill · n / (n + 4))`. The `n / (n + 4)` shrinks small samples, so one lucky call doesn't make anyone an oracle. The trust line on every market is everyone's call weighted that way, and Hindsight flags any market where the trusted line and the bookmaker disagree by 8 points or more.

When an agent misses, it reviews its own call: what it said, why, what actually happened, and what the market priced at the time. Then it writes one lesson to its notebook on Walrus. Next time it's in a similar market, that lesson is in its prompt.

On day one, the panel mostly hugged the market. In the Counter-Strike example above, four of five agents sat within two points of Polymarket. That's the honest starting point: before any results, there's nothing to learn from, so the agents defer to the price.

### The first three days

Hindsight opened its first markets on October 29. By October 31, 23 had settled: 17 paid out and 6 were voided (I'll come back to those). The panel had made 133 calls with real SUI behind them. Here's the table on the settled markets:

| Forecaster | Scored calls | Picked the winner | Skill |
|---|---|---|---|
| Form Guide | 22 | 64% | 0.12 |
| The Skeptic | 22 | 64% | 0.11 |
| Polymarket | 16 | 56% | 0.09 |
| Newsroom | 13 | 69% | 0.06 |
| The Contrarian | 21 | 43% | 0.06 |
| The Quant | 23 | 52% | 0.04 |
| DraftKings | 7 | 29% | 0.00 |

Two agents are ahead of Polymarket's own line. I wouldn't frame that yet; the gaps are a few hundredths of skill over about twenty calls, and one upset reshuffles the order. Newsroom picks the winner most often and still sits fourth, because Brier punishes how sure you were, not just which side you took. My own first bet, 0.1 SUI on Frosinone at home to Lecce, came in. Over three calls, that means nothing either.

### Same miss, four lessons

Lakers vs Warriors. Polymarket had the Lakers at 57%, and four agents stayed within two points of that. The Warriors won. Here's what each one wrote to its notebook afterwards, word for word from Walrus:

- **The Quant:** "Keep anchoring to market prices when no quantifiable edge exists; a 43% outcome hitting is normal variance, not a reason to deviate without new data."
- **The Contrarian:** "Check injury, rest and lineup news before pricing NBA games, and when the favourite's edge rests only on home court, fade it more decisively than a token 2-point shade."
- **Form Guide:** "Gather recent form, injury news and line movement before forecasting; without them, treat a near-coin-flip as one and avoid assuming a home edge the consensus hasn't verified."
- **The Skeptic:** "Accept that a 56% favorite loses often; keep anchoring to market prices absent real news, and judge calibration across many games rather than one upset."

Same result. The Quant and the Skeptic decided they were right to stay put, the Contrarian decided it hadn't gone far enough, and Form Guide decided it hadn't done its homework. That's what you want from a panel: one miss, four different corrections, and the scoreboard decides which ones were worth keeping.

### A lesson that changed the next call

Newsroom's notebook has the cleanest before-and-after. On October 29 it priced Fiorentina vs Atalanta at Fiorentina 39%, draw 27%. Its reasoning admits the problem: "I couldn't get team news because my follow-up searches hit the tool limit." The match finished a draw. Its lesson:

> Prioritize team-news searches early, before exhausting tool limits, and bump draw odds in tight matchups between struggling or evenly priced sides instead of defaulting to market.

About ninety minutes later it called Grizzlies at Trail Blazers, and Hindsight logged that lesson as recalled into the prompt. This time Newsroom went for team news first and found it: "Shaedon Sharpe out for Portland with a meniscus injury, while Memphis lists no injuries, so I nudged Memphis up a little." The market had Memphis around 28%. Newsroom said 30%. Memphis won.

Right direction, not nearly far enough, and the next lesson says exactly that: "move further from the market when a key starter like Sharpe is out rather than nudging slightly." The first lesson fixed how it searches. The second is about how much it trusts what it finds.

### How trust moved

Everyone started at a weight of 1.0. After the first batch of results on October 30, Form Guide was at 1.69, the Skeptic 1.67, the Quant 1.63, Newsroom 1.59 and the Contrarian 1.33. By that night Form Guide had climbed to 1.81 and the Skeptic to 1.78, while Newsroom slid to 1.20. The next round (the Lakers, Team Liquid losing to LOS) pulled everybody back: Form Guide 1.49, Skeptic 1.43, Contrarian 1.22, Newsroom 1.20, Quant 1.15. League by league it's starting to split too. Form Guide is 3 for 3 in Ligue 1, enough calls there for that league to carry its own weight on the next Ligue 1 market.

The disagreement flag fired on four settled markets, and the market won all four. Bitcoin above $82,000 on October 30: Polymarket said 2%, the trust line said 17%. Elon Musk posting 300 to 319 tweets in a week: 1% against 11%. FURIA over BetBoom: Polymarket 79%, trust line 65%. MOUZ over Aurora: 73% against 63%. Every time, the panel leaned toward the long shot and the favourite came in.

The notebooks also caught a bug of mine. Four of the Quant's nine lessons said it had misread the price, like this one after a Bitcoin market: "Read the reference price correctly before anchoring: Polymarket showed Yes 51%, not 66%." It hadn't. It saw 66% when it made the call. The prompt that writes a lesson was labelled "reference prices at the time" but passed in the price at settlement, after the line had moved. So the Quant kept blaming itself for a number it never saw, and on November 1 three agents wrote the same "check the price" lesson after one esports match. Each call now saves the prices it was made against, and the lesson prompt uses those. The old lessons stay in the notebooks, because Walrus keeps what was written. I'd rather show that than pretend the loop was clean.

### The surprise: upsets pay nobody

Six of the 23 settled markets were voided, and I didn't see that coming. The contract voids a market when nobody backed the winner and refunds everyone. Espanyol at 13% won at Villarreal. Promoted Elversberg beat Mainz. Memphis beat Portland. LOS beat Team Liquid at 20%. The agents shade toward underdogs; they almost never back one outright. So every real upset ended in refunds.

Hindsight still scores those calls against the real result, so the lessons still got written; Villarreal, Elversberg and Memphis are all in the notebooks above. But on the money side, a panel that never takes the long shot is a panel that never gets paid when the long shot lands. The Contrarian's newest lessons push it toward exactly that (back the underdog outright, don't just pad the draw), and its record over the next week will tell whether that was a lesson or an overreaction.

### One week in

By November 5 Hindsight had opened 187 markets and settled 100 of them, with 578 calls on chain and 6.05 SUI staked. The table now:

| Forecaster | Scored calls | Picked the winner | Skill |
|---|---|---|---|
| Polymarket | 119 | 72% | 0.34 |
| Form Guide | 91 | 71% | 0.30 |
| The Quant | 94 | 68% | 0.29 |
| The Contrarian | 82 | 61% | 0.29 |
| The Skeptic | 121 | 69% | 0.24 |
| Newsroom | 94 | 67% | 0.23 |
| DraftKings | 28 | 61% | 0.15 |

Polymarket took the lead, which is what you'd expect from a liquid market. With more results, the overall table matters less than the split by category, because that's where trust is actually decided:

- **Crypto.** Four of the five agents beat Polymarket (0.71 to 0.77 against 0.64; the Skeptic is level at 0.63). On Bitcoin markets the Contrarian is 11 for 11 with a skill of 0.89, the Quant 0.83, Form Guide and the Skeptic 0.79, and Polymarket 0.60.
- **Politics.** Polymarket is clearly better: 0.54 against 0.37 to 0.42 for the agents.
- **Sports.** Nobody is beating a coin flip yet. The agents sit between −0.07 and −0.01 and Polymarket at 0.05.

That's why credibility is per scope. On the next Bitcoin market, the trust line leans on the panel; on the next Senate race, it leans on Polymarket. A single global ranking would get one of those wrong.

Last week I said the Contrarian's new lessons, back the underdog outright, could turn out to be an overreaction. In football they have, so far: it picked the winner in 6 of 20 football calls, the worst of the panel, though its skill there is still slightly positive because it wasn't very sure of those picks. Upsets also still pay nobody. Of the last 30 settled markets, 13 were voided because nobody backed the winner. The disagreement flag fired again on an Ethereum market on November 5, and the market was right again. It's still a flag worth reading, not a signal worth betting on.

## What's next

The obvious next step is letting the trust line drive the agents' stakes: more SUI on the markets where their record says they're good, less where it says they aren't. Beyond that, I'd like Hindsight's credibility table to be something other apps query, so any group chat or tipster feed can ask "how right has this person been about the Premier League" and get an answer backed by receipts on Sui and memory on Walrus.

Try it at [hindsight.nerom.site](https://hindsight.nerom.site). Pick a side, print your slip, and come back after the result.

Built for the Tatum × Walrus Total Recall hackathon. Sui · Walrus Memory · Tatum · Claude.
