// Independently verifies one pick: chain (via Tatum) and Walrus Memory.
// Usage: tsx scripts/verify-pick.ts <digest> <marketKey> <outcome> <confidence> [reasoning]
import "dotenv/config";
import { MemWal } from "@mysten-incubation/memwal";
import { readPlaced, sui, tatum, eventType } from "../lib/sui";
import { sha256 } from "../lib/memory";
import { humanNote } from "../lib/engine";

const [digest, marketKey, outcome, confidence, reasoning = ""] = process.argv.slice(2);
if (!digest || !marketKey) throw new Error("usage: verify-pick.ts <digest> <marketKey> <outcome> <confidence> [reasoning]");

// 1. The transaction and its Placed event, read through Tatum.
const { placed, timestampMs } = await readPlaced(digest);
console.log("chain: Placed event found", {
  picker: placed.picker,
  market: placed.market_id,
  outcome: Number(placed.outcome),
  stakeSui: Number(placed.stake) / 1e9,
  placedAt: new Date(Number(placed.placed_at_ms)).toISOString(),
  checkpointAt: timestampMs ? new Date(timestampMs).toISOString() : null,
});

// 2. The ticket object exists and is owned by the picker.
const obj = await tatum(() => sui().getObject({ objectId: placed.ticket_id }));
const owner = (obj.object as { owner?: unknown }).owner;
console.log("chain: ticket", placed.ticket_id, "type", obj.object.type, "owner", JSON.stringify(owner));
console.log("chain: ticket type is ours:", obj.object.type === eventType("Ticket"));

// 3. The note hash on chain matches the pick as the app recorded it.
const expected = sha256(humanNote({ marketKey, outcome: Number(outcome), confidence: Number(confidence), reasoning })).toString("hex");
const onchain = Buffer.from(placed.note_hash).toString("hex");
console.log("chain: note hash matches:", expected === onchain, onchain.slice(0, 16) + "…");

// 4. Walrus: recall the pick memory and the user memory by query.
const mw = MemWal.create({ key: process.env.MEMWAL_PRIVATE_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, serverUrl: process.env.MEMWAL_SERVER_URL });
const short = `${placed.picker.slice(0, 6)}`;
const picks = await mw.recall(`${placed.picker} pick ${marketKey}`, { namespace: "picks", limit: 5 });
const hit = picks.results.find((r) => r.text.includes(placed.picker) || r.text.includes(short));
console.log("walrus: picks memory:", hit ? `${hit.text.slice(0, 160)}… (blob ${hit.blob_id})` : "NOT FOUND");
const user = await mw.recall("what does this person follow", { namespace: `user:${placed.picker}`, limit: 3 });
console.log("walrus: user memory:", user.results[0] ? `${user.results[0].text} (blob ${user.results[0].blob_id})` : "NOT FOUND");
