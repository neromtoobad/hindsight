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
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file());
}

// The web app and the worker are separate processes writing one file, so writes take a
// directory lock (mkdir is atomic). A lock older than 20s belongs to a dead process.
const lockDir = () => path.join(env.dataDir, "db.lock");

async function acquire() {
  fs.mkdirSync(env.dataDir, { recursive: true });
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(lockDir());
      return;
    } catch {
      try {
        if (Date.now() - fs.statSync(lockDir()).mtimeMs > 20_000) fs.rmdirSync(lockDir());
      } catch {}
      if (i > 2000) throw new Error("db lock timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

const release = () => {
  try {
    fs.rmdirSync(lockDir());
  } catch {}
};

let chain: Promise<unknown> = Promise.resolve();

/** Serialised read-modify-write, across this process (queue) and others (lock). */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    await acquire();
    try {
      const db = load();
      const out = await fn(db);
      save(db);
      return out;
    } finally {
      release();
    }
  });
  chain = next.catch(() => {});
  return next;
}
