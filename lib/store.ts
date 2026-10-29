import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import type { Db } from "./types";

const empty = (): Db => ({
  markets: {},
  picks: [],
  forecasters: {},
  cred: {},
  memory: [],
  snapshots: [],
  paid: {},
});

const file = () => path.join(env.dataDir, "db.json");

export function load(): Db {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(file(), "utf8")) };
  } catch {
    return empty();
  }
}

export function save(db: Db) {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const tmp = file() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file());
}

let chain: Promise<unknown> = Promise.resolve();

/** Serialised read-modify-write. The app and worker share one process on Railway. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const db = load();
    const out = await fn(db);
    save(db);
    return out;
  });
  chain = next.catch(() => {});
  return next;
}
