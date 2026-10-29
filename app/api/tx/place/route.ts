import { z } from "zod";
import { toBase64 } from "@mysten/sui/utils";
import { load } from "@/lib/store";
import { buildPlaceTx, sui } from "@/lib/sui";
import { sha256 } from "@/lib/memory";
import { humanNote } from "@/lib/engine";

const Body = z.object({
  marketKey: z.string(),
  outcome: z.number().int().min(0),
  stakeMist: z.string().regex(/^\d+$/),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(600),
  sender: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
});

/**
 * Builds the pick transaction through Tatum (gas and objects resolved server-side) and returns
 * the bytes. The wallet signs and submits them; /api/picks then reads the result back from chain.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const b = parsed.data;
  const m = load().markets[b.marketKey];
  if (!m?.onchainId || m.status !== "open" || m.closesAt <= Date.now()) return Response.json({ error: "market is not open" }, { status: 400 });
  if (b.outcome >= m.outcomes.length) return Response.json({ error: "bad outcome" }, { status: 400 });

  const noteHash = sha256(humanNote({ marketKey: b.marketKey, outcome: b.outcome, confidence: b.confidence, reasoning: b.reasoning }));
  const tx = buildPlaceTx({ marketId: m.onchainId, outcome: b.outcome, stakeMist: BigInt(b.stakeMist), noteHash, sender: b.sender });
  try {
    const bytes = await tx.build({ client: sui() });
    return Response.json({ bytes: toBase64(bytes) });
  } catch (e) {
    const msg = (e as Error).message;
    if (/InsufficientCoinBalance|insufficient SUI balance|gas selection/i.test(msg))
      return Response.json({ error: `Not enough SUI in this wallet for a ${Number(b.stakeMist) / 1e9} SUI stake plus gas. Pick a smaller stake or top up.` }, { status: 400 });
    return Response.json({ error: msg.slice(0, 200) }, { status: 400 });
  }
}
