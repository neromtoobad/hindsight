import { z } from "zod";
import { chatStream } from "@/lib/chat";

export const dynamic = "force-dynamic";

const Body = z.object({
  agent: z.enum(["quant", "contrarian", "form", "skeptic", "newsroom"]),
  marketKey: z.string().max(80).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(800) }))
    .min(1)
    .max(14),
});

// Every message is a model call: cap each visitor at 30 an hour.
const hits = new Map<string, number[]>();
function allowed(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 30) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!allowed(ip)) return Response.json({ error: "You've chatted a lot this hour. The agents need a breather; try again soon." }, { status: 429 });
  const { agent, marketKey, messages } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return Response.json({ error: "last message must be yours" }, { status: 400 });

  try {
    const { stream, lessons } = await chatStream(agent, marketKey, messages);
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(ctrl) {
        try {
          for await (const ev of stream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "refusal") ctrl.enqueue(enc.encode("\n\n(I'd rather not go there. Ask me about my calls.)"));
        } catch {
          ctrl.enqueue(enc.encode("\n\n(Lost my train of thought. Ask again?)"));
        } finally {
          ctrl.close();
        }
      },
      cancel() {
        stream.abort();
      },
    });
    return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "x-lessons-recalled": String(lessons), "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
