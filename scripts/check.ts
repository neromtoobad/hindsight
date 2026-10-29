// Connectivity check: Tatum gRPC, resolver balance, Walrus Memory, Claude. Prints no secrets.
import "dotenv/config";
import { sui, resolver, balanceOf, fmtSui } from "../lib/sui";
import { memoryHealth } from "../lib/memory";
import Anthropic from "@anthropic-ai/sdk";

const addr = resolver().toSuiAddress();
try {
  const chain = await sui().getChainIdentifier();
  console.log("tatum grpc ok, chain", chain.chainIdentifier);
  console.log("resolver", addr, fmtSui(await balanceOf(addr)), "SUI");
} catch (e) {
  console.log("tatum grpc FAILED:", (e as Error).message);
}
console.log("memory", JSON.stringify(await memoryHealth()));
try {
  const r = await new Anthropic().messages.create({ model: process.env.AGENT_MODEL ?? "claude-opus-5-5", max_tokens: 50, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with: ok" }] });
  console.log("claude", r.model, r.stop_reason);
} catch (e) {
  console.log("claude FAILED:", (e as Error).message);
}
