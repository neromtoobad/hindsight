import { z } from "zod";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { mutate } from "@/lib/store";
import { sui } from "@/lib/sui";
import { remember } from "@/lib/memory";
import { CHARACTERS, TINTS, cleanName, profileMessage } from "@/lib/profile";

const Body = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  name: z.string().min(1).max(40),
  avatar: z.enum(CHARACTERS),
  tint: z.enum(TINTS),
  issuedAt: z.string(),
  signature: z.string().min(10),
});

/** Save a player's character. The wallet must sign the exact profile message. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const b = parsed.data;
  const address = normalizeSuiAddress(b.address);
  const name = cleanName(b.name);
  if (name.length < 2) return Response.json({ error: "name must be 2 to 18 letters or numbers" }, { status: 400 });
  const age = Date.now() - Date.parse(b.issuedAt);
  if (!(age >= -60_000 && age < 10 * 60_000)) return Response.json({ error: "signature expired, try again" }, { status: 400 });

  const msg = new TextEncoder().encode(profileMessage({ address: b.address, name: b.name, avatar: b.avatar, tint: b.tint, issuedAt: b.issuedAt }));
  try {
    await verifyPersonalMessageSignature(msg, b.signature, { address, client: sui() });
  } catch {
    return Response.json({ error: "signature does not match this wallet" }, { status: 401 });
  }

  await mutate((d) => {
    const f = (d.forecasters[address] ??= { id: address, kind: "human", name });
    Object.assign(f, { name, avatar: b.avatar, tint: b.tint });
  });
  await remember(`user:${address}`, `${name} (${address}) plays as the ${b.avatar} character.`, `profile:${address}:${b.avatar}:${name}`);
  return Response.json({ ok: true, name, avatar: b.avatar, tint: b.tint });
}
