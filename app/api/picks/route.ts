import { z } from "zod";
import { ingestHumanPick } from "@/lib/engine";

const Body = z.object({
  digest: z.string().min(32),
  marketKey: z.string(),
  outcome: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(600),
  name: z.string().max(32).optional(),
});

/** The browser signs and submits the pick itself; this reads it back from chain via Tatum and indexes it. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  // The tx may still be propagating to the gateway; retry briefly.
  for (let i = 0; i < 6; i++) {
    try {
      const ticketId = await ingestHumanPick(parsed.data);
      return Response.json({ ok: true, ticketId });
    } catch (e) {
      const msg = (e as Error).message;
      if (/mismatch|does not match/.test(msg) || i === 5) return Response.json({ error: msg }, { status: 400 });
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
