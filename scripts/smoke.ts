// Gas-free smoke test: one Walrus Memory round trip and one house-agent decision on a live market.
import "dotenv/config";
import { MemWal } from "@mysten-incubation/memwal";
import * as pm from "../lib/sources/polymarket";
import { PERSONAS, decide } from "../lib/agents";

const mw = MemWal.create({ key: process.env.MEMWAL_PRIVATE_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, serverUrl: process.env.MEMWAL_SERVER_URL });
const text = `[${new Date().toISOString()}] smoke: Receipts connected to Walrus Memory on mainnet.`;
const job = await mw.remember(text, "smoke");
const done = await mw.waitForRememberJob(job.job_id);
console.log("remember", job.job_id, JSON.stringify(done).slice(0, 200));
const r = await mw.recall("Receipts connected", { namespace: "smoke", limit: 2 });
console.log("recall", r.results.map((x) => x.text));

const [m] = (await pm.discover()).filter((x) => x.category === "politics");
const out = await decide(PERSONAS[0], m, { lessons: [], history: [], trust: m.outcomes.map(() => 1 / m.outcomes.length), now: Date.now() });
console.log(m.question, m.ref, JSON.stringify(out, null, 1));
