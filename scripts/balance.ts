// Usage: tsx scripts/balance.ts [address...]   (defaults to the resolver)
import "dotenv/config";
import { sui, resolver, fmtSui } from "../lib/sui";
const owners = process.argv.slice(2).length ? process.argv.slice(2) : [resolver().toSuiAddress()];
for (const owner of owners) {
  const b = await sui().getBalance({ owner });
  console.log(owner, fmtSui(b.balance.balance), "SUI", `(coins ${fmtSui(b.balance.coinBalance ?? "0")}, address ${fmtSui(b.balance.addressBalance ?? "0")})`);
}
