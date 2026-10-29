import { z } from "zod";
import { mutate } from "@/lib/store";
import { readClaimed } from "@/lib/sui";

const Body = z.object({ digest: z.string().min(32) });

/** Marks tickets claimed once the Claimed event is visible on chain. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  for (let i = 0; i < 5; i++) {
    const claimed = await readClaimed(parsed.data.digest).catch(() => []);
    if (claimed.length) {
      await mutate((d) => {
        for (const c of claimed) {
          const p = d.picks.find((x) => x.ticketId === c.ticket_id);
          if (p) p.claimed = true;
        }
      });
      return Response.json({ ok: true, amounts: claimed.map((c) => String(c.amount)) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return Response.json({ error: "no Claimed event found" }, { status: 400 });
}
