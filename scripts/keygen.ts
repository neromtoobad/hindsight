// Makes the resolver/treasury key and appends it to .env. Prints only the address.
import fs from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const envFile = ".env";
const cur = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
if (/^RESOLVER_SECRET=.+/m.test(cur)) {
  const secret = cur.match(/^RESOLVER_SECRET=(.+)$/m)![1].trim();
  console.log("exists:", Ed25519Keypair.fromSecretKey(secret).toSuiAddress());
  process.exit(0);
}
const kp = new Ed25519Keypair();
const next = /^RESOLVER_SECRET=$/m.test(cur)
  ? cur.replace(/^RESOLVER_SECRET=$/m, `RESOLVER_SECRET=${kp.getSecretKey()}`)
  : cur + `\nRESOLVER_SECRET=${kp.getSecretKey()}\n`;
fs.writeFileSync(envFile, next, { mode: 0o600 });
console.log("resolver address:", kp.toSuiAddress());
