// Production entry: the Next app and the worker side by side in one service, sharing the data dir
// (a Railway volume at $DATA_DIR). If either process dies, exit so Railway restarts the service.
//
// First boot on an empty volume: SEED_DB_B64 / SEED_AGENTS_B64 (gzip+base64 of db.json /
// agents.json) are written into the data dir. Existing files are never overwritten.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataDir = resolve(process.env.DATA_DIR ?? join(root, "data"));
const port = process.env.PORT ?? "3000";

fs.mkdirSync(dataDir, { recursive: true });
// Seeds are gzip+base64 (Railway caps a variable at 32 KB).
for (const [name, v] of [["db.json", "SEED_DB_B64"], ["agents.json", "SEED_AGENTS_B64"]]) {
  const target = join(dataDir, name);
  if (!fs.existsSync(target) && process.env[v]) {
    fs.writeFileSync(target, gunzipSync(Buffer.from(process.env[v], "base64")), { mode: 0o600 });
    console.log(`[start] seeded ${name} from ${v}`);
  }
}

const children = [];
function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, DATA_DIR: dataDir }, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.error(`[start] ${name} exited (${signal ?? code}); shutting down`);
    for (const c of children) if (c !== child) c.kill("SIGTERM");
    process.exit(code ?? 1);
  });
  children.push(child);
}

run("app", [join(root, "node_modules/next/dist/bin/next"), "start", "-p", port, "-H", "0.0.0.0"]);
if (process.env.RUN_WORKER !== "0") run("worker", [join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/worker.ts"]);

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => children.forEach((c) => c.kill(sig)));
