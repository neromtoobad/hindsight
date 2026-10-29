import { z } from "zod";
import { load } from "@/lib/store";
import { recall } from "@/lib/memory";
import { answer } from "@/lib/agents";
import { leaderboard } from "@/lib/views";

const Body = z.object({ question: z.string().min(3).max(300) });

/** "Who should I trust on the midterms?" Answered from Walrus memories plus the live credibility table. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const q = parsed.data.question;
  const [cred, scores] = await Promise.all([recall("credibility", q, 4, "recent"), recall("scorecards", q, 8)]);
  const memories = [...cred, ...scores].map((m) => m.text);
  const table = leaderboard(load())
    .filter((r) => r.n > 0)
    .map((r) => `${r.name}: skill ${r.skill.toFixed(2)} over ${r.n}, ${Math.round(r.hitRate * 100)}% right`)
    .join("\n");
  const text = await answer(q, memories, table || "no scored picks yet");
  return Response.json({ answer: text, memories });
}
