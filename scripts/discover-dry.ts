// Prints what the worker would open right now. No chain writes.
import * as pm from "../lib/sources/polymarket";
import * as espn from "../lib/sources/espn";
const [a, b] = await Promise.all([pm.discover(), espn.discover()]);
for (const m of [...b.slice(0, 8), ...a])
  console.log(
    m.category.padEnd(9), m.league.padEnd(15), new Date(m.closesAt).toISOString().slice(0, 16), m.question.slice(0, 72),
    JSON.stringify(Object.fromEntries(Object.entries(m.ref).map(([k, v]) => [k, v.map((x) => +x.toFixed(2))]))),
  );
console.log(a.length, "polymarket,", b.length, "football");
