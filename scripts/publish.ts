// Builds move/ with the Sui CLI, publishes it through Tatum, and writes the ids into .env.
import "dotenv/config";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { Transaction } from "@mysten/sui/transactions";
import { sui, resolver } from "../lib/sui";

const SUI_BIN = process.env.SUI_BIN ?? `${process.env.HOME}/.sui-cli/ext/sui`;

const built = JSON.parse(
  execFileSync(SUI_BIN, ["move", "build", "--dump-bytecode-as-base64", "--path", "move", "-e", process.env.SUI_NETWORK ?? "mainnet"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
) as { modules: string[]; dependencies: string[] };

const signer = resolver();
const sender = signer.toSuiAddress();
const tx = new Transaction();
const upgradeCap = tx.publish({ modules: built.modules, dependencies: built.dependencies });
tx.transferObjects([upgradeCap], sender);

const res = await sui().signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true, objectTypes: true } });
if (res.$kind !== "Transaction") throw new Error(JSON.stringify(res.FailedTransaction.status));
const t = res.Transaction;
await sui().waitForTransaction({ digest: t.digest });

const types = t.objectTypes ?? {};
const find = (suffix: string) => Object.entries(types).find(([, ty]) => ty.endsWith(suffix))?.[0];
const configId = find("::market::Config");
const capId = find("::market::ResolverCap");
const pkg = t.effects!.changedObjects.find((o) => o.outputState === "PackageWrite")?.objectId;
if (!pkg || !configId || !capId) throw new Error(`could not find ids: ${JSON.stringify({ pkg, configId, capId, types })}`);

let env = fs.readFileSync(".env", "utf8");
for (const [k, v] of Object.entries({ RECEIPTS_PACKAGE_ID: pkg, RECEIPTS_CONFIG_ID: configId, RECEIPTS_RESOLVER_CAP_ID: capId })) {
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + `\n${k}=${v}\n`;
}
fs.writeFileSync(".env", env, { mode: 0o600 });
console.log({ digest: t.digest, package: pkg, config: configId, resolverCap: capId });
