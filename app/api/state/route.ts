import { load } from "@/lib/store";
import { leaderboard, marketCard, stats } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = load();
  const now = Date.now();
  const markets = Object.values(db.markets).filter((m) => m.onchainId);
  const open = markets.filter((m) => m.status === "open" && m.closesAt > now).sort((a, b) => a.closesAt - b.closesAt);
  const live = markets.filter((m) => m.status === "open" && m.closesAt <= now);
  const settled = markets
    .filter((m) => m.status === "resolved" || m.status === "void")
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
    .slice(0, 30);
  return Response.json({
    stats: stats(db),
    open: open.map((m) => marketCard(db, m)),
    awaiting: live.map((m) => marketCard(db, m)),
    settled: settled.map((m) => marketCard(db, m)),
    leaderboard: leaderboard(db),
  });
}
