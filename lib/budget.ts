// Guard rails on model spend. In the first week two things burned credit: a pick that was decided
// but could not be placed (no gas) was decided again on every tick, and nothing bounded a day's calls.
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/** Model calls allowed per UTC day: the worker (picks and lessons) and the site (chat and ask). */
export const CAPS = {
  worker: Number(process.env.AGENT_CALLS_PER_DAY ?? 200),
  chat: Number(process.env.CHAT_CALLS_PER_DAY ?? 300),
};
export type Scope = keyof typeof CAPS;

export class BudgetError extends Error {}

type State = { day: string; calls: number; cooldown: Record<string, number> };

// One file per scope: the app and the worker are separate processes and never write the same file.
const file = (scope: Scope) => path.join(env.dataDir, `budget.${scope}.json`);
const today = () => new Date().toISOString().slice(0, 10);

function read(scope: Scope): State {
  let s: State = { day: today(), calls: 0, cooldown: {} };
  try {
    s = { ...s, ...JSON.parse(fs.readFileSync(file(scope), "utf8")) };
  } catch {}
  if (s.day !== today()) Object.assign(s, { day: today(), calls: 0 });
  const now = Date.now();
  for (const [k, until] of Object.entries(s.cooldown)) if (until <= now) delete s.cooldown[k];
  return s;
}

function write(scope: Scope, s: State) {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const tmp = `${file(scope)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, file(scope));
}

export const callsLeft = (scope: Scope) => Math.max(0, CAPS[scope] - read(scope).calls);

/** Count one model call against today's cap. Throws BudgetError once the cap is reached. */
export function spend(scope: Scope) {
  const s = read(scope);
  if (s.calls >= CAPS[scope]) throw new BudgetError(`daily model budget reached (${CAPS[scope]} ${scope} calls, resets 00:00 UTC)`);
  s.calls++;
  write(scope, s);
}

/** Run one model call under today's cap. A request the API rejects is not billed, so it is not counted. */
export async function metered<T>(scope: Scope, fn: () => Promise<T>): Promise<T> {
  spend(scope);
  try {
    return await fn();
  } catch (e) {
    const s = read(scope);
    if (s.calls > 0) {
      s.calls--;
      write(scope, s);
    }
    throw e;
  }
}

/** Worker-side cooldowns, e.g. "this agent already paid for a call on this market; don't ask again yet". */
export const coolingDown = (key: string) => (read("worker").cooldown[key] ?? 0) > Date.now();

export function coolOff(key: string, ms: number) {
  const s = read("worker");
  s.cooldown[key] = Date.now() + ms;
  write("worker", s);
}
