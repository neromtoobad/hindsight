// x402 on Sui, self-facilitated. A paid resource answers 402 with its price; the client pays the
// treasury in SUI, then retries with X-PAYMENT carrying the transaction digest. We verify the
// payment through Tatum (balance changes, success, age, single use) and serve the resource.
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { sui, resolver } from "./sui";
import { load, mutate } from "./store";

export const NETWORK = `sui:${process.env.SUI_NETWORK ?? "mainnet"}`;
const SUI_TYPE = /^0x0*2::sui::SUI$/;
const MAX_AGE_MS = 15 * 60_000;

export const payTo = () => process.env.X402_PAY_TO ?? resolver().toSuiAddress();

export interface Requirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: { proof: "digest"; decimals: 9 };
}

export function requirement(resource: string, priceMist: bigint, description: string): Requirement {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: priceMist.toString(),
    asset: "0x2::sui::SUI",
    payTo: payTo(),
    resource,
    description,
    mimeType: "application/json",
    maxTimeoutSeconds: MAX_AGE_MS / 1000,
    extra: { proof: "digest", decimals: 9 },
  };
}

export function paymentRequired(req: Requirement, error?: string) {
  return Response.json({ x402Version: 1, error: error ?? "payment required", accepts: [req] }, { status: 402 });
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

/** Returns the settlement header value on success, or a 402 Response to send back. */
export async function verify(header: string | null, req: Requirement): Promise<{ ok: true; header: string; payer: string } | { ok: false; res: Response }> {
  if (!header) return { ok: false, res: paymentRequired(req) };
  let digest: string;
  try {
    const p = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (p.scheme !== "exact" || p.network !== NETWORK) throw new Error();
    digest = String(p.payload?.digest ?? "");
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(digest)) throw new Error();
  } catch {
    return { ok: false, res: paymentRequired(req, "malformed X-PAYMENT") };
  }
  if (load().paid[digest]) return { ok: false, res: paymentRequired(req, "payment already used") };

  const res = await sui()
    .getTransaction({ digest, include: { balanceChanges: true, transaction: true } })
    .catch(() => null);
  const t = res?.$kind === "Transaction" ? res.Transaction : null;
  if (!t || !t.status.success) return { ok: false, res: paymentRequired(req, "payment not found or failed") };
  if (t.timestampMs && Date.now() - t.timestampMs > MAX_AGE_MS) return { ok: false, res: paymentRequired(req, "payment too old") };
  const to = normalizeSuiAddress(req.payTo);
  const received = (t.balanceChanges ?? [])
    .filter((c) => SUI_TYPE.test(c.coinType))
    .filter((c) => normalizeSuiAddress(c.address) === to)
    .reduce((s, c) => s + BigInt(c.amount), 0n);
  if (received < BigInt(req.maxAmountRequired)) return { ok: false, res: paymentRequired(req, `paid ${received} MIST, need ${req.maxAmountRequired}`) };

  const payer = t.transaction?.sender ?? "unknown";
  const fresh = await mutate((db) => {
    if (db.paid[digest]) return false;
    db.paid[digest] = { at: Date.now(), resource: req.resource, payer };
    return true;
  });
  if (!fresh) return { ok: false, res: paymentRequired(req, "payment already used") };
  return { ok: true, payer, header: b64({ success: true, transaction: digest, network: NETWORK, payer }) };
}
