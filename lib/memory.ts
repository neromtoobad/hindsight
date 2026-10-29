// Walrus Memory (MemWal) on Mainnet. One account, many namespaces:
//   picks              every pick, with reasoning, before the event
//   scorecards         every scored pick after the result
//   lessons:<agent>    what a house agent decided to do differently after a miss
//   credibility        periodic trust tables (who to believe, per scope)
//   user:<address>     what a person follows and how they pick
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { env } from "./env";
import { mutate } from "./store";
import type { MemoryWrite } from "./types";

let _mw: MemWal | null = null;

function mw(): MemWal {
  if (!_mw) {
    _mw = MemWal.create({
      key: env.memwalKey(),
      accountId: env.memwalAccountId(),
      serverUrl: env.memwalServer,
      namespace: "picks",
    });
  }
  return _mw;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest();

/**
 * Write one memory and log it. Never throws: a memory outage must not block a pick.
 * Returns the job id when accepted.
 */
export async function remember(namespace: string, text: string, idempotencyKey?: string) {
  const at = Date.now();
  if (!env.memoryEnabled()) {
    await log({ at, namespace, text, status: "failed", error: "memory not configured" });
    return null;
  }
  try {
    const job = await mw().remember(text, namespace, { idempotencyKey, dedupe: true });
    await log({ at, namespace, text, jobId: job.job_id, status: "queued" });
    // Settle in the background so callers stay fast.
    mw()
      .waitForRememberJob(job.job_id)
      .then((r) => patch(job.job_id, { status: "stored", blobId: (r as { blob_id?: string }).blob_id }))
      .catch((e) => patch(job.job_id, { status: "failed", error: String(e?.message ?? e) }));
    return job.job_id;
  } catch (e) {
    await log({ at, namespace, text, status: "failed", error: String((e as Error).message ?? e) });
    return null;
  }
}

export async function recall(namespace: string, query: string, limit = 6, sort?: "recent") {
  if (!env.memoryEnabled()) return [];
  try {
    const r = await mw().recall(query, { namespace, limit, ...(sort ? { sort } : {}) });
    return r.results.map((m) => ({ text: m.text, at: m.created_at, blobId: m.blob_id, distance: m.distance }));
  } catch {
    return [];
  }
}

export async function memoryHealth() {
  if (!env.memoryEnabled()) return { ok: false, reason: "not configured" };
  try {
    return { ok: true, ...(await mw().health()) };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message) };
  }
}

async function log(w: MemoryWrite) {
  await mutate((db) => {
    db.memory.push(w);
    if (db.memory.length > 5000) db.memory.splice(0, db.memory.length - 5000);
  });
}

async function patch(jobId: string, p: Partial<MemoryWrite>) {
  await mutate((db) => {
    const w = db.memory.find((m) => m.jobId === jobId);
    if (w) Object.assign(w, p);
  });
}
