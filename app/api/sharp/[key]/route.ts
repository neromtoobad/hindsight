import { load } from "@/lib/store";
import { line, disagreement } from "@/lib/credibility";
import { requirement, verify } from "@/lib/x402";

export const dynamic = "force-dynamic";

const PRICE_MIST = BigInt(process.env.SHARP_PRICE_MIST ?? "10000000"); // 0.01 SUI

/**
 * The sharp line: Receipts' credibility-weighted probabilities for one market, with who moved it.
 * Paid per call over x402, settled in SUI on Sui. Built for other agents to buy.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const db = load();
  const m = db.markets[key];
  if (!m) return Response.json({ error: "not found" }, { status: 404 });

  const resource = new URL(req.url).pathname;
  const r = requirement(resource, PRICE_MIST, `Receipts sharp line for "${m.question}"`);
  const v = await verify(req.headers.get("x-payment"), r);
  if (!v.ok) return v.res;

  const fresh = load();
  const l = line(fresh, m);
  const body = {
    market: { key: m.key, question: m.question, outcomes: m.outcomes, closesAt: m.closesAt, status: m.status, onchainId: m.onchainId },
    sharp: l.trust,
    crowd: l.crowd,
    reference: m.ref,
    disagreement: disagreement(l, m),
    weights: l.contributors.slice(0, 8).map((c) => ({ forecaster: fresh.forecasters[c.forecaster]?.name ?? c.forecaster, weight: +c.w.toFixed(3), scope: c.scope, scored: c.n, probs: c.probs })),
    paidBy: v.payer,
  };
  return Response.json(body, { headers: { "X-PAYMENT-RESPONSE": v.header } });
}
