"use client";
import type { MemoryWrite } from "@/lib/types";
import { ago } from "./meta";

const LABEL: Record<string, string> = { picks: "pick", scorecards: "scorecard", credibility: "trust", lessons: "lesson", user: "you" };

/** Strip the "[2026-10-29T05:31Z] " stamp the engine prefixes; we show relative time instead. */
const body = (t: string) => t.replace(/^\[[^\]]+\]\s*/, "");

export function MemoryFeed({ items, stored }: { items: MemoryWrite[]; stored: number }) {
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="k">Walrus memory · live</span>
        <span className="k">{stored} stored on mainnet</span>
      </div>
      {items.length === 0 && <p style={{ color: "var(--mute)", fontSize: 14 }}>Every pick, result and lesson is written here as it happens.</p>}
      {items.slice(0, 7).map((m, j) => {
        const ns = m.namespace.split(":")[0];
        return (
          <div className="mem" key={j}>
            <i>{LABEL[ns] ?? ns}</i>
            <span>
              {body(m.text).slice(0, 170)}
              {body(m.text).length > 170 ? "…" : ""}{" "}
              <span className={m.status === "stored" ? "ok" : m.status === "failed" ? "bad" : "k"} style={{ fontSize: 11 }}>
                {m.status === "stored" ? "stored ✓" : m.status === "failed" ? "failed" : "writing…"} · {ago(m.at)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
