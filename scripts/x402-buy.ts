// An agent buying the sharp line over x402: GET -> 402 -> pay on Sui -> retry with X-PAYMENT.
// Usage: tsx scripts/x402-buy.ts <market key> [base url]   (pays from BUYER_SECRET, else the Newsroom agent's wallet)
import "dotenv/config";
import { keypairFrom, sendSui } from "../lib/sui";
import { agentWallets } from "../lib/agents";

const key = process.argv[2];
const base = process.argv[3] ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
if (!key) throw new Error("usage: x402-buy.ts <market key> [base url]");
const url = `${base}/api/sharp/${encodeURIComponent(key)}`;
const buyer = keypairFrom(process.env.BUYER_SECRET ?? agentWallets().newsroom.secret);

const first = await fetch(url);
if (first.status !== 402) throw new Error(`expected 402, got ${first.status}: ${await first.text()}`);
const { accepts } = (await first.json()) as { accepts: { network: string; scheme: string; payTo: string; maxAmountRequired: string; description: string }[] };
const req = accepts[0];
console.log("402:", req.description, `${Number(req.maxAmountRequired) / 1e9} SUI to ${req.payTo}`);

const digest = await sendSui(buyer, req.payTo, BigInt(req.maxAmountRequired));
console.log("paid:", digest);

const payment = Buffer.from(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { digest } })).toString("base64");
const paid = await fetch(url, { headers: { "X-PAYMENT": payment } });
console.log(paid.status, paid.headers.get("x-payment-response") ? "settled" : "");
console.log(JSON.stringify(await paid.json(), null, 2));
