// Talk to a house agent about its calls. The agent answers from its own pick, its record and the
// lessons it wrote to Walrus after past misses: the memory loop, made conversational.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { load } from "./store";
import { recall } from "./memory";
import { PERSONAS, type Persona } from "./agents";
import { line, skill } from "./credibility";

const pct = (x: number) => `${Math.round(x * 100)}%`;
let _ai: Anthropic | null = null;
const ai = () => (_ai ??= new Anthropic());

export type ChatMsg = { role: "user" | "assistant"; content: string };

const RULES = `You are chatting with a player on Hindsight, a prediction market on Sui where every call is logged before the event and scored after (Brier score). You speak in first person, in character, in 2 to 5 short sentences. Plain words, no lists unless asked.

Rules:
- Explain and defend your own call honestly, including what would change your mind. Admit uncertainty.
- Your stake is already on chain as a ticket, so it cannot change; you can still say if an argument moves your thinking for next time.
- Use the lessons from your Walrus notebook when they are relevant, and say so ("my notebook says…").
- Never tell the player what to bet, how much, or that a bet is safe. You describe your view; they decide.
- If asked about something unrelated to forecasting or your markets, steer back briefly.
- Use only the facts in the context below. If you don't know, say so.`;

async function context(p: Persona, marketKey: string | undefined, lastUser: string) {
  const db = load();
  const id = `agent:${p.slug}`;
  const parts: string[] = [];

  const all = skill(db, id, "all");
  const scopes = Object.keys(db.cred[id] ?? {})
    .filter((s) => s !== "all")
    .map((s) => ({ s, ...skill(db, id, s) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  parts.push(
    `Your record: ${all.n ? `${all.n} scored calls, ${pct(all.hitRate)} right, skill ${all.skill.toFixed(2)} (0 = coin flip, higher is better)` : "no calls scored yet"}.${
      scopes.length ? ` By scope: ${scopes.map((x) => `${x.s} ${x.n} scored, skill ${x.skill.toFixed(2)}`).join("; ")}.` : ""
    }`,
  );

  const m = marketKey ? db.markets[marketKey] : undefined;
  if (m) {
    const l = line(db, m);
    const mine = db.picks.filter((x) => x.marketKey === m.key && x.forecaster === id).sort((a, b) => b.placedAt - a.placedAt)[0];
    const others = PERSONAS.filter((o) => o.slug !== p.slug)
      .map((o) => ({ o, pk: db.picks.filter((x) => x.marketKey === m.key && x.forecaster === `agent:${o.slug}`).sort((a, b) => b.placedAt - a.placedAt)[0] }))
      .filter((x) => x.pk);
    parts.push(
      `The market being discussed: "${m.question}" (${m.category}/${m.league}), closes ${new Date(m.closesAt).toUTCString()}, status ${m.status}${
        m.winner !== undefined ? `, settled on ${m.outcomes[m.winner]}` : ""
      }.`,
      `Hindsight trust line: ${m.outcomes.map((o, j) => `${o} ${pct(l.trust[j])}`).join(", ")}.`,
      ...Object.entries(m.ref).map(([s, pr]) => `${s === "bookmaker" ? "DraftKings" : "Polymarket"}: ${m.outcomes.map((o, j) => `${o} ${pct(pr[j])}`).join(", ")}.`),
      mine
        ? `Your call: ${m.outcomes.map((o, j) => `${o} ${pct(mine.probs[j])}`).join(", ")}; you staked ${Number(mine.stakeMist ?? 0) / 1e9} SUI on ${m.outcomes[mine.outcome ?? 0]}. Your reasoning then: ${mine.reasoning ?? "none recorded"}${
            mine.lessonsUsed?.length ? ` Lesson you applied: ${mine.lessonsUsed[0]}` : ""
          }${mine.brier !== undefined ? ` Result: ${mine.correct ? "right" : "wrong"}, Brier ${mine.brier.toFixed(2)}.` : ""}`
        : `You have not called this market yet (you call markets in their last 36 hours).`,
      others.length ? `The other agents: ${others.map(({ o, pk }) => `${o.name} ${m.outcomes.map((x, j) => `${x} ${pct(pk!.probs[j])}`).join("/")}`).join("; ")}.` : "",
    );
  } else {
    const recent = db.picks
      .filter((x) => x.forecaster === id)
      .sort((a, b) => b.placedAt - a.placedAt)
      .slice(0, 5)
      .map((x) => {
        const mm = db.markets[x.marketKey];
        return mm ? `"${mm.question}": ${mm.outcomes[x.outcome ?? 0]} at ${pct(Math.max(...x.probs))}` : null;
      })
      .filter(Boolean);
    if (recent.length) parts.push(`Your latest calls: ${recent.join("; ")}.`);
  }

  const q = m ? `${m.category}/${m.league}: ${m.question} ${lastUser}` : lastUser;
  const [lessons, scores] = await Promise.all([recall(`lessons:${p.slug}`, q, 5), recall("scorecards", `${p.name} ${q}`, 4, "recent")]);
  const own = scores.map((s) => s.text).filter((t) => t.includes(p.name));
  parts.push(
    `Your Walrus notebook (lessons you wrote after misses): ${lessons.length ? lessons.map((l) => l.text.replace(/^\[[^\]]+\]\s*/, "")).join(" | ") : "empty so far"}.`,
    own.length ? `Recent scorecards from Walrus: ${own.map((t) => t.replace(/^\[[^\]]+\]\s*/, "")).join(" | ")}.` : "",
  );
  return { text: parts.filter(Boolean).join("\n"), lessons: lessons.length };
}

export async function chatStream(slug: string, marketKey: string | undefined, messages: ChatMsg[]) {
  const p = PERSONAS.find((x) => x.slug === slug);
  if (!p) throw new Error("unknown agent");
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const ctx = await context(p, marketKey, lastUser);
  const stream = ai().messages.stream({
    model: env.agentModel,
    max_tokens: 1200,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: `You are ${p.name}. ${p.blurb} Your style: ${p.style}\n\n${RULES}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Context (live from Hindsight and Walrus):\n${ctx.text}` },
    ],
    messages,
  });
  return { stream, lessons: ctx.lessons };
}
