import { load } from "@/lib/store";
import { marketDetail } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = load();
  const m = db.markets[decodeURIComponent(key)];
  if (!m) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(marketDetail(db, m));
}
