import { z } from "zod";
import { toBase64 } from "@mysten/sui/utils";
import { load } from "@/lib/store";
import { buildClaimTx, sui } from "@/lib/sui";

const Body = z.object({ ticketId: z.string(), sender: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/) });

/** Bytes for claiming a winning (or refunded) ticket. The ticket survives as the record. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const db = load();
  const pick = db.picks.find((p) => p.ticketId === parsed.data.ticketId);
  const m = pick && db.markets[pick.marketKey];
  if (!pick || !m?.onchainId) return Response.json({ error: "unknown ticket" }, { status: 404 });
  const tx = buildClaimTx({ marketId: m.onchainId, ticketId: pick.ticketId!, sender: parsed.data.sender });
  try {
    return Response.json({ bytes: toBase64(await tx.build({ client: sui() })) });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 400 });
  }
}
