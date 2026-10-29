import { load } from "@/lib/store";
import { memoryFeed } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ns = new URL(req.url).searchParams.get("ns") ?? undefined;
  return Response.json(memoryFeed(load(), ns));
}
