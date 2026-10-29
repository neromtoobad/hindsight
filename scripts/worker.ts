// The loop: open markets, let the house agents pick, settle what has closed, write what was learned.
import "dotenv/config";
import { syncMarkets, fundAgents, agentRound, resolveRound, agentClaimRound, credibilityRound, ensureForecasters } from "../lib/engine";
import { mutate } from "../lib/store";

const TICK_MS = Number(process.env.WORKER_TICK_MINUTES ?? 10) * 60_000;
const CRED_EVERY_MS = 6 * 3600_000;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

let lastCred = 0;

async function tick() {
  await mutate((d) => ensureForecasters(d));
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      if (r !== undefined) log(name, r);
    } catch (e) {
      log(`${name} failed:`, (e as Error).message);
    }
  };
  await step("resolve", () => resolveRound(log));
  await step("claims", () => agentClaimRound(log));
  await step("markets", () => syncMarkets(log));
  await step("fund", () => fundAgents(log));
  await step("agents", () => agentRound(undefined, log));
  if (Date.now() - lastCred > CRED_EVERY_MS) {
    lastCred = Date.now();
    await step("credibility", () => credibilityRound());
  }
}

const once = process.argv.includes("--once");
do {
  await tick();
  if (!once) await new Promise((r) => setTimeout(r, TICK_MS));
} while (!once);
