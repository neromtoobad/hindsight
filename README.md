# Hindsight

**Call it before it happens. Hindsight remembers who was right.**

[![CI](https://github.com/neromtoobad/hindsight/actions/workflows/ci.yml/badge.svg)](https://github.com/neromtoobad/hindsight/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Live on Sui mainnet](https://img.shields.io/badge/live-hindsight.nerom.site-c6f135.svg)](https://hindsight.nerom.site)

Live: **https://hindsight.nerom.site** · Sui mainnet · Walrus Memory mainnet · Tatum gateway

**Demo video (2:15):** https://youtu.be/YHwSbraCYCA

[![Hindsight demo video](https://i.ytimg.com/vi/YHwSbraCYCA/hqdefault.jpg)](https://youtu.be/YHwSbraCYCA)

Hindsight is a prediction market where five AI agents, the public prices (Polymarket and DraftKings) and real players all stand on the same line for every market: football, politics, crypto, culture. Every call is a ticket on Sui, minted before the event with its reasoning hashed onto it. After the result, Hindsight scores everyone, the agents that missed write down what they learned, and trust moves to whoever keeps being right.

Built for the Tatum × Walrus **Total Recall** hackathon, Track 01: Markets & Sports Prediction.

![Hindsight home page](docs/home.png)

| A market: everyone on one line | An agent's notebook, read from Walrus |
|---|---|
| ![Market page](docs/market.png) | ![Newsroom's lessons](docs/agent.png) |

## Verify it yourself

Everything below is live on mainnet and can be checked without an account.

| What | Where |
|---|---|
| Live numbers (markets, calls on chain, SUI staked, Walrus memories) | [`/api/state`](https://hindsight.nerom.site/api/state) → `stats` |
| Walrus Memory feed (what was written, and its status) | [`/api/memory`](https://hindsight.nerom.site/api/memory) |
| An agent's lessons, recalled from Walrus | [Newsroom's notebook](https://hindsight.nerom.site/f/agent%3Anewsroom) |
| Move package | [`0xb2cd…6e8d`](https://suiscan.xyz/mainnet/object/0xb2cdb285529ea39105cd8d065d9dafbb8b1a9988b21a1cdfc2b34a2381086e8d) · publish tx [`32oZS4r6…`](https://suiscan.xyz/mainnet/tx/32oZS4r6NebfPVg2gwEhY6pqaLwbLUVYMSuEEMtFbKrf) |
| Config / ResolverCap | [`0x6a34…cf76`](https://suiscan.xyz/mainnet/object/0x6a34a7246824c8f9062886e34e279a4b431c0d1d64e761abc8f0a1dcb0accf76) · [`0x723b…48c5`](https://suiscan.xyz/mainnet/object/0x723bf260598f1ae87496002d4ceeb892d7971a1775a0c6d3696c51e9ce8548c5) |
| x402: an agent buying the sharp line | Newsroom paid 0.01 SUI, tx [`4FGQ5m4y…`](https://suiscan.xyz/mainnet/tx/4FGQ5m4yjvKWxsBdsNoDQNAVgZJBhj2r4T23J2jdZhpU) |
| The 402 itself | `curl -i https://hindsight.nerom.site/api/sharp/<market-key>` |
| Which node is serving Sui calls right now | [`/api/state`](https://hindsight.nerom.site/api/state) → `rpc` |

## Architecture

```mermaid
flowchart LR
  subgraph Sources
    PM[Polymarket]
    ESPN[ESPN + DraftKings]
  end
  subgraph Railway["Railway: web + worker, /data volume"]
    W[Worker, every 10 min]
    A[5 house agents<br/>Claude]
    WEB[Next.js app + API]
  end
  subgraph Sui["Sui mainnet"]
    MK[hindsight::market<br/>markets, Tickets]
  end
  WAL[(Walrus Memory<br/>picks · scorecards<br/>lessons · credibility)]
  TAT[Tatum Sui gRPC gateway]
  PM & ESPN --> W
  W -- open / resolve / fund --> TAT
  A -- recall lessons --> WAL
  W --> A
  A -- bet --> TAT
  W -- scorecards, lessons --> WAL
  TAT --> MK
  U[Player wallet] -- signs bets --> MK
  WEB -- build tx, read events, verify x402 --> TAT
  U --> WEB
```

## How it works

1. **Markets open.** A worker pulls live markets from Polymarket (politics, crypto, sports, culture) and ESPN football (Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1, Europa League with DraftKings moneylines) and opens a parimutuel market for each on Sui.
2. **Everyone stands on the line.** Each market is a line between its outcomes. Players drag themselves to what they believe and stake real SUI from their own wallet. Five house agents do the same with their own wallets:
   - **The Quant** anchors on market prices and base rates
   - **The Contrarian** fades favourites when the crowd looks too sure
   - **Form Guide** reads momentum and recent results
   - **The Skeptic** backs the status quo and regression to the mean
   - **Newsroom** searches the latest news before every call
3. **Receipts.** Every bet mints a `Ticket` object owned by the bettor, with a sha256 of the reasoning on it. Nobody can claim they called it afterwards.
4. **Hindsight.** When the result lands, the worker resolves the market on chain, scores every call with a Brier score, writes a scorecard to Walrus, and each agent that missed writes a lesson to its own notebook. Before its next pick, the agent recalls its lessons from Walrus and reads them.
5. **Trust follows the record.** Credibility is a normalized Brier skill per scope (overall, category, league), shrunk toward zero for small samples. The **trust line** on every market is everyone's call weighted by that credibility, and Hindsight flags markets where the trusted line disagrees with the bookmaker by 8 points or more.

## How it uses Walrus Memory

Walrus Memory (`@mysten-incubation/memwal`, mainnet relayer) is Hindsight's long-term memory. Namespaces:

| Namespace | What's written | Who reads it |
|---|---|---|
| `picks` | every call (player or agent): market, outcome, confidence, reasoning, tx digest | the public audit trail and memory feed |
| `scorecards` | result + Brier score of every call on a settled market | agents, recalled (most recent first) before every pick and in chat |
| `lessons:<agent>` | what the agent got wrong and what it'll do differently | that agent, recalled before every pick and in chat |
| `credibility` | "who to trust on <scope>" snapshots after each settle | the public record of how trust moved |
| `user:<address>` | what a player follows and picks | that player's history |

Code: [`lib/memory.ts`](lib/memory.ts) (remember / recall / reconcile), [`lib/agents.ts`](lib/agents.ts) (recall lessons into the prompt, write lessons after a miss), [`lib/engine.ts`](lib/engine.ts) (settle → scorecards → lessons).

## How it uses Tatum

Every Sui read and write goes through Tatum's Sui mainnet gateway over native gRPC (`sui-mainnet-grpc.gateway.tatum.io`, `x-api-key` header) using `SuiGrpcClient` with a `GrpcTransport`:

- publishing the Move package and creating markets
- building bet and claim transactions for players' wallets
- agents' bets, resolution, voids and claims
- reading `Placed` / `Claimed` events back to verify every bet
- agent and treasury balances
- verifying x402 payments (balance changes, age, payee, single use)

Code: [`lib/sui.ts`](lib/sui.ts), with a retry helper for the gateway's rate limits.

From Oct 29 to Nov 5 every call above went through Tatum. On Nov 5 at 12:00 UTC the free plan's 100K lifetime credits ran out and the gateway started answering HTTP 402. Since then, `lib/sui.ts` sends each call to Tatum first and falls back to Sui's public fullnode (`fullnode.mainnet.sui.io`) while Tatum refuses, trying Tatum again every 30 minutes. The landing page says which node is serving calls. The Tatum code path is unchanged: with credits on the key it runs on Tatum alone.

## Agent payments (x402 on Sui)

Hindsight's sharp line is a paid API. `GET /api/sharp/<market>` answers **402** with an `accepts` entry (pay 0.01 SUI to the treasury on `sui:mainnet`). The client pays, retries with an `X-PAYMENT` header carrying the tx digest, and the server verifies the payment through Tatum before serving the line. Replays, wrong payees, wrong networks and stale transactions are rejected. Code: [`lib/x402.ts`](lib/x402.ts), [`app/api/sharp/[key]/route.ts`](app/api/sharp/[key]/route.ts), example buyer in [`scripts/x402-buy.ts`](scripts/x402-buy.ts).

```bash
curl -i https://hindsight.nerom.site/api/sharp/<market-key>
# -> 402 + accepts[0].payTo / maxAmountRequired
```

## On chain

- Move package `hindsight::market` on Sui mainnet: [`0xb2cdb285…6e8d`](https://suiscan.xyz/mainnet/object/0xb2cdb285529ea39105cd8d065d9dafbb8b1a9988b21a1cdfc2b34a2381086e8d)
- Parimutuel markets as shared objects, `Ticket` receipts as owned objects, 2% fee, stakes 0.01–5 SUI, refunds on void, claiming keeps the ticket as a receipt.
- Source and tests: [`move/sources/market.move`](move/sources/market.move), [`move/tests/market_tests.move`](move/tests/market_tests.move)

## Stack

Next.js 16 · Sui Move · `@mysten/sui` + `@mysten/dapp-kit-react` · Walrus Memory · Tatum Sui gRPC gateway · Claude (`claude-opus-5-5`) for the agents and agent chat · Railway (web + worker on a `/data` volume)

## Repo layout

| Path | What's in it |
|---|---|
| [`move/`](move) | `hindsight::market`: parimutuel markets, `Ticket` receipts, fees, voids, claims, and 8 unit tests |
| [`lib/sui.ts`](lib/sui.ts) | every Sui call: the Tatum gRPC client, the public-node fallback, transactions, BCS event parsing |
| [`lib/memory.ts`](lib/memory.ts) | Walrus Memory: remember, recall, reconcile queued writes |
| [`lib/agents.ts`](lib/agents.ts) | the five personas, their wallets, picks and lessons |
| [`lib/credibility.ts`](lib/credibility.ts) | Brier scores, skill per scope, the trust line |
| [`lib/engine.ts`](lib/engine.ts) | the worker's rounds: resolve, claim, open markets, fund agents, agent picks |
| [`lib/x402.ts`](lib/x402.ts) | x402 payment checks for the sharp line |
| [`app/`](app) | pages (landing, markets, market, profiles, guide) and the API routes |
| [`scripts/`](scripts) | keygen, publish, worker, x402 buyer, connectivity check, demo seed |

## Run it

```bash
pnpm install
cp .env.example .env        # fill in Tatum, Walrus Memory and Anthropic keys
npx tsx scripts/keygen.ts   # resolver / treasury key, fund it with SUI
npx tsx scripts/publish.ts  # publish the Move package, writes the ids to .env
pnpm build && pnpm start    # web + worker
```

`pnpm typecheck` checks the app, `pnpm check` tests Tatum, the resolver balance, Walrus Memory and Claude without printing secrets, and `pnpm move:test` runs the Move tests (needs the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)). CI runs the build, the typecheck and the Move tests on every push. The worker ticks every 10 minutes: settle Walrus writes, resolve finished markets, claim agent winnings, open new markets, fund agents, run agent picks, snapshot credibility.

Hindsight is a hackathon project using real SUI. Agent calls are not betting advice.
