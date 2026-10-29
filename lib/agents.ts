import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { env } from "./env";
import type { MarketRec, PickRec } from "./types";

export interface Persona {
  slug: string;
  name: string;
  blurb: string;
  style: string;
  webSearch?: boolean;
}

export const PERSONAS: Persona[] = [
  {
    slug: "quant",
    name: "The Quant",
    blurb: "Anchors on market prices and base rates. Moves only when the numbers say so.",
    style: "Start from the reference prices and historical base rates. Deviate only for a concrete, quantifiable reason. Never round to certainty.",
  },
  {
    slug: "contrarian",
    name: "The Contrarian",
    blurb: "Fades favourites when the crowd looks too sure of itself.",
    style: "Look for where the favourite is overpriced. Prefer the side the crowd is underrating, but only when you can say why the crowd is wrong.",
  },
  {
    slug: "form",
    name: "Form Guide",
    blurb: "Momentum, recent results and who is in form.",
    style: "Weight recent form and momentum heavily: last five results, trend lines, polling movement, price trend.",
  },
  {
    slug: "skeptic",
    name: "The Skeptic",
    blurb: "Bets on the status quo and regression to the mean.",
    style: "Assume the boring outcome. Hype fades, incumbents hold, prices drift back. Demand strong evidence for change.",
  },
  {
    slug: "newsroom",
    name: "Newsroom",
    blurb: "Reads the latest news before every call.",
    style: "Search for the latest news (injuries, lineups, polls, filings, announcements) and let fresh facts drive the call.",
    webSearch: true,
  },
];

// --- Wallets: one Sui key per agent, kept on the data volume ---

const walletFile = () => path.join(env.dataDir, "agents.json");

export function agentWallets(): Record<string, { secret: string; address: string }> {
  let w: Record<string, { secret: string; address: string }> = {};
  try {
    w = JSON.parse(fs.readFileSync(walletFile(), "utf8"));
  } catch {}
  let changed = false;
  for (const p of PERSONAS) {
    if (!w[p.slug]) {
      const kp = new Ed25519Keypair();
      w[p.slug] = { secret: kp.getSecretKey(), address: kp.toSuiAddress() };
      changed = true;
    }
  }
  if (changed) {
    fs.mkdirSync(env.dataDir, { recursive: true });
    fs.writeFileSync(walletFile(), JSON.stringify(w, null, 2), { mode: 0o600 });
  }
  return w;
}

// --- Picking ---

const PickOut = z.object({
  probs: z.array(z.number()).describe("Probability for each outcome, same order as given, summing to 1"),
  pick: z.number().int().describe("Index of the outcome you back with money"),
  reasoning: z.string().describe("Two or three plain sentences. Concrete facts, no hedging filler."),
  lessons_applied: z.array(z.string()).describe("Lessons from your notebook you actually used, copied verbatim. Empty if none applied."),
});
export type AgentPick = z.infer<typeof PickOut>;

const LessonOut = z.object({
  lesson: z.string().describe("One sentence, under 200 characters, starting with a verb: what to do differently next time in this kind of market."),
});

let _ai: Anthropic | null = null;
const ai = () => (_ai ??= new Anthropic());

const pct = (x: number) => `${Math.round(x * 100)}%`;

export async function decide(
  p: Persona,
  m: MarketRec,
  ctx: { lessons: string[]; history: string[]; trust: number[]; now: number },
): Promise<AgentPick> {
  const refs = Object.entries(m.ref)
    .map(([src, probs]) => `${src}: ${m.outcomes.map((o, i) => `${o} ${pct(probs[i])}`).join(", ")}`)
    .join("\n");
  const prompt = `Market: ${m.question}
Category: ${m.category} / ${m.league}
Outcomes (index: name): ${m.outcomes.map((o, i) => `${i}: ${o}`).join("; ")}
Picks close: ${new Date(m.closesAt).toISOString()} (now ${new Date(ctx.now).toISOString()})

Reference prices:
${refs || "none"}
Current Receipts trust line: ${m.outcomes.map((o, i) => `${o} ${pct(ctx.trust[i])}`).join(", ")}

Your notebook (lessons you wrote after past misses):
${ctx.lessons.length ? ctx.lessons.map((l) => `- ${l}`).join("\n") : "- (empty)"}

Your recent scorecards:
${ctx.history.length ? ctx.history.map((h) => `- ${h}`).join("\n") : "- (none yet)"}

Give your probabilities, the outcome you back, and why. If a notebook lesson fits this market, apply it and list it.`;

  const res = await ai().messages.parse({
    model: env.agentModel,
    max_tokens: 4000,
    output_config: { effort: p.webSearch ? "medium" : "low", format: zodOutputFormat(PickOut) },
    system: `You are ${p.name}, a forecaster in Receipts, a prediction market where every call is logged before the event and scored after. ${p.style} You are scored by Brier score, so calibrated probabilities beat bold ones.`,
    ...(p.webSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 2 }] } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  const out = res.parsed_output;
  if (!out) throw new Error(`${p.slug}: no parsed output (stop ${res.stop_reason})`);
  return normalise(out, m.outcomes.length);
}

function normalise(o: AgentPick, k: number): AgentPick {
  let probs = o.probs.slice(0, k).map((x) => Math.min(0.97, Math.max(0.03, Number(x) || 0)));
  while (probs.length < k) probs.push(1 / k);
  const s = probs.reduce((a, b) => a + b, 0);
  probs = probs.map((x) => x / s);
  const pick = o.pick >= 0 && o.pick < k ? o.pick : probs.indexOf(Math.max(...probs));
  return { ...o, probs, pick };
}

export async function lessonFrom(p: Persona, m: MarketRec, pick: PickRec): Promise<string> {
  const res = await ai().messages.parse({
    model: env.agentModel,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(LessonOut) },
    system: `You are ${p.name}, reviewing a forecast you got wrong. ${p.style}`,
    messages: [
      {
        role: "user",
        content: `Market: ${m.question} (${m.category}/${m.league})
You said: ${m.outcomes.map((o, i) => `${o} ${pct(pick.probs[i])}`).join(", ")}
Your reasoning then: ${pick.reasoning}
Actual result: ${m.outcomes[m.winner!]}
Reference prices at the time: ${Object.entries(m.ref).map(([s, pr]) => `${s} ${m.outcomes.map((o, i) => `${o} ${pct(pr[i])}`).join(", ")}`).join(" | ") || "none"}

Write the one lesson you will apply next time.`,
      },
    ],
  });
  return res.parsed_output?.lesson ?? "";
}

export async function answer(question: string, memories: string[], table: string): Promise<string> {
  const res = await ai().messages.create({
    model: env.agentModel,
    max_tokens: 2000,
    output_config: { effort: "low" },
    system:
      "You are Receipts, a prediction market that remembers every call. Answer from the memories and the credibility table only. Name forecasters and numbers. Three sentences at most. Never tell the reader to bet or which side to take.",
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nCredibility table:\n${table}\n\nMemories from Walrus:\n${memories.map((m) => `- ${m}`).join("\n") || "- none"}`,
      },
    ],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}
