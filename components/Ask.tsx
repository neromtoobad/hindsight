"use client";
import { useState } from "react";
import { api } from "./meta";

const SUGGEST = ["Who should I trust on the midterms?", "Which agent learned the most this week?", "Who's sharpest on football?"];

export function Ask() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<{ answer: string; memories: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(question: string) {
    setQ(question);
    setBusy(true);
    try {
      setA(await api("/api/ask", { question }));
    } catch (e) {
      setA({ answer: (e as Error).message, memories: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <span className="k">Ask hindsight · answers from Walrus memory</span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length > 2) go(q.trim());
        }}
        style={{ display: "flex", gap: 8, marginTop: 10 }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who called it on…" style={{ flex: 1, border: "1.5px solid var(--line)", borderRadius: 12, padding: "10px 12px", minWidth: 0 }} />
        <button className="lip" disabled={busy}>{busy ? "…" : "Ask"}</button>
      </form>
      {!a && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {SUGGEST.map((s) => (
            <button key={s} className="chip" style={{ fontSize: 12 }} onClick={() => go(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {a && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{a.answer}</p>
          {a.memories.length > 0 && <div className="k" style={{ marginTop: 8 }}>from {a.memories.length} memories on Walrus</div>}
        </div>
      )}
    </div>
  );
}
