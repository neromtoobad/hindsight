import { z } from "zod";
import { load } from "@/lib/store";
import { recall } from "@/lib/memory";
import { answer } from "@/lib/agents";
import { BudgetError } from "@/lib/budget";
import { leaderboard } from "@/lib/views";

export const dynamic = "force-dynamic";

const Body = z.object({ question: z.string().min(3).max(300) });

// Every question is a model call: cap each visitor at 12 an hour.
const hits = new Map<string, number[]>();
function allowed(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 12) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}

/** "Who should I trust on the midterms?" Answered from Walrus memories plus the live credibility table. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!allowed(ip)) return Response.json({ error: "That's a lot of questions this hour. Try again soon." }, { status: 429 });
  const q = parsed.data.question;
  try {
    const [cred, scores] = await Promise.all([recall("credibility", q, 4, "recent"), recall("scorecards", q, 8)]);
    const memories = [...cred, ...scores].map((m) => m.text);
    const table = leaderboard(load())
      .filter((r) => r.n > 0)
      .map((r) => `${r.name}: skill ${r.skill.toFixed(2)} over ${r.n}, ${Math.round(r.hitRate * 100)}% right`)
      .join("\n");
    const text = await answer(q, memories, table || "no scored picks yet");
    return Response.json({ answer: text, memories });
  } catch (e) {
    console.error("ask failed:", (e as Error).message);
    const error =
      e instanceof BudgetError
        ? "Hindsight has answered its limit of questions for today. The race board and every agent's record are still live."
        : "Hindsight can't answer right now. The race board and every agent's record are still live.";
    return Response.json({ error }, { status: e instanceof BudgetError ? 429 : 503 });
  }
}
