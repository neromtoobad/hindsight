import { load } from "@/lib/store";
import { profile } from "@/lib/views";
import { recall } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const p = profile(load(), id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  // An agent's notebook lives in Walrus; read it back live.
  const lessons = id.startsWith("agent:") ? await recall(`lessons:${id.slice(6)}`, "lessons from misses", 20, "recent") : [];
  return Response.json({ ...p, lessons });
}
