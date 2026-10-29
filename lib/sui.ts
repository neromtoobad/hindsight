// Every Sui read and write goes through Tatum's gateway (gRPC, x-api-key).
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";
import { env } from "./env";

let _client: SuiGrpcClient | null = null;

// Tatum serves native gRPC (application/grpc), not gRPC-web, so we bring an HTTP/2 transport.
export function sui(): SuiGrpcClient {
  if (!_client) {
    const host = env.grpcUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    _client = new SuiGrpcClient({
      network: env.network,
      transport: new GrpcTransport({
        host: host.includes(":") ? host : `${host}:443`,
        channelCredentials: ChannelCredentials.createSsl(),
        meta: { "x-api-key": env.tatumKey() },
      }),
    });
  }
  return _client;
}

export const keypairFrom = (secret: string) => Ed25519Keypair.fromSecretKey(secret);
export const resolver = () => keypairFrom(env.resolverSecret());

const target = (fn: string) => `${env.packageId()}::market::${fn}`;
export const eventType = (name: string) => `${env.packageId()}::market::${name}`;

// --- BCS layouts of the Move events (json shape differs across transports; bcs does not) ---

export const PlacedEvent = bcs.struct("Placed", {
  market_id: bcs.Address,
  ticket_id: bcs.Address,
  picker: bcs.Address,
  outcome: bcs.u64(),
  stake: bcs.u64(),
  placed_at_ms: bcs.u64(),
  note_hash: bcs.vector(bcs.u8()),
});

export const MarketCreatedEvent = bcs.struct("MarketCreated", {
  market_id: bcs.Address,
  key: bcs.string(),
  question: bcs.string(),
  category: bcs.string(),
  source: bcs.string(),
  outcomes: bcs.vector(bcs.string()),
  closes_at_ms: bcs.u64(),
});

export const ResolvedEvent = bcs.struct("Resolved", {
  market_id: bcs.Address,
  winner: bcs.u64(),
  total: bcs.u64(),
  fee: bcs.u64(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tatum rate-limits bursts (HTTP 429). A rejected request was never executed, so retrying is safe. */
export async function tatum<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= tries - 1 || !/429|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) throw e;
      await sleep(700 * 2 ** i);
    }
  }
}

async function run(tx: Transaction, signer: Ed25519Keypair) {
  const res = await tatum(() =>
    sui().signAndExecuteTransaction({
      transaction: tx,
      signer,
      include: { effects: true, events: true },
    }),
  );
  if (res.$kind === "FailedTransaction") {
    const t = res.FailedTransaction;
    throw new Error(`tx ${t.digest} failed: ${JSON.stringify(t.status)}`);
  }
  await tatum(() => sui().waitForTransaction({ digest: res.Transaction.digest }));
  return res.Transaction;
}

export const runAs = run;

function findEvent(events: { eventType: string; bcs: Uint8Array }[] | undefined, name: string) {
  return events?.find((e) => e.eventType === eventType(name));
}

// --- Resolver writes ---

export async function createMarket(m: {
  key: string;
  question: string;
  category: string;
  source: string;
  outcomes: string[];
  closesAt: number;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("create_market"),
    arguments: [
      tx.object(env.resolverCapId()),
      tx.pure.string(m.key),
      tx.pure.string(m.question.slice(0, 300)),
      tx.pure.string(m.category),
      tx.pure.string(m.source),
      tx.pure.vector("string", m.outcomes),
      tx.pure.u64(m.closesAt),
      tx.object.clock(),
    ],
  });
  const t = await run(tx, resolver());
  const ev = findEvent(t.events, "MarketCreated");
  if (!ev) throw new Error(`no MarketCreated in ${t.digest}`);
  return { marketId: MarketCreatedEvent.parse(ev.bcs).market_id, digest: t.digest };
}

export async function resolveMarket(marketId: string, winner: number) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("resolve"),
    arguments: [
      tx.object(env.resolverCapId()),
      tx.object(marketId),
      tx.object(env.configId()),
      tx.pure.u64(winner),
      tx.object.clock(),
    ],
  });
  const t = await run(tx, resolver());
  const voided = Boolean(findEvent(t.events, "Voided"));
  return { digest: t.digest, voided };
}

export async function voidMarket(marketId: string) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("void"),
    arguments: [tx.object(env.resolverCapId()), tx.object(marketId)],
  });
  return (await run(tx, resolver())).digest;
}

// --- Picks (used by house agents server-side and by the browser) ---

export function buildPlaceTx(p: {
  marketId: string;
  outcome: number;
  stakeMist: bigint;
  noteHash: Uint8Array;
  sender: string;
}) {
  const tx = new Transaction();
  tx.setSender(p.sender);
  // coinWithBalance draws from coin objects or the address balance, whichever the wallet holds.
  const stake = tx.add(coinWithBalance({ balance: p.stakeMist }));
  const ticket = tx.moveCall({
    target: target("place"),
    arguments: [
      tx.object(p.marketId),
      tx.object(env.configId()),
      tx.pure.u64(p.outcome),
      stake,
      tx.pure.vector("u8", Array.from(p.noteHash)),
      tx.object.clock(),
    ],
  });
  tx.transferObjects([ticket], p.sender);
  return tx;
}

export async function placeAs(signer: Ed25519Keypair, p: Omit<Parameters<typeof buildPlaceTx>[0], "sender">) {
  const t = await run(buildPlaceTx({ ...p, sender: signer.toSuiAddress() }), signer);
  const ev = findEvent(t.events, "Placed");
  if (!ev) throw new Error(`no Placed in ${t.digest}`);
  return { digest: t.digest, placed: PlacedEvent.parse(ev.bcs) };
}

export function buildClaimTx(p: { marketId: string; ticketId: string; sender: string }) {
  const tx = new Transaction();
  tx.setSender(p.sender);
  const coin = tx.moveCall({
    target: target("claim"),
    arguments: [tx.object(p.marketId), tx.object(p.ticketId)],
  });
  tx.transferObjects([coin], p.sender);
  return tx;
}

/** Read a pick back from chain by digest. This is how browser picks enter the index. */
export async function readPlaced(digest: string) {
  const res = await tatum(() => sui().getTransaction({ digest, include: { events: true } }));
  if (res.$kind !== "Transaction") throw new Error(`tx ${digest} failed`);
  const ev = findEvent(res.Transaction.events, "Placed");
  if (!ev) throw new Error(`tx ${digest} has no Placed event`);
  const placed = PlacedEvent.parse(ev.bcs);
  return { placed, sender: placed.picker, timestampMs: res.Transaction.timestampMs };
}

export const ClaimedEvent = bcs.struct("Claimed", {
  market_id: bcs.Address,
  ticket_id: bcs.Address,
  picker: bcs.Address,
  amount: bcs.u64(),
});

/** Ticket ids claimed in a transaction, read back through Tatum. */
export async function readClaimed(digest: string) {
  const res = await tatum(() => sui().getTransaction({ digest, include: { events: true } }));
  if (res.$kind !== "Transaction") return [];
  return (res.Transaction.events ?? []).filter((e) => e.eventType === eventType("Claimed")).map((e) => ClaimedEvent.parse(e.bcs));
}

export async function balanceOf(address: string) {
  const b = await tatum(() => sui().getBalance({ owner: address }));
  return BigInt(b.balance.balance);
}

export async function sendSui(signer: Ed25519Keypair, to: string, mist: bigint) {
  const tx = new Transaction();
  tx.transferObjects([tx.add(coinWithBalance({ balance: mist }))], to);
  return (await run(tx, signer)).digest;
}

export const MIST = 1_000_000_000n;
export const fmtSui = (mist: bigint | string) => (Number(BigInt(mist)) / 1e9).toFixed(3);
