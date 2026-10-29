"use client";
import { use, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { AGENTS, avatar, api, ago, pct, short, sui, type PickV } from "@/components/meta";

type Profile = {
  id: string;
  name: string;
  kind: "human" | "agent" | "source";
  blurb?: string;
  scopes: { scope: string; skill: number; n: number; hitRate: number }[];
  history: { at: number; w: number }[];
  picks: PickV[];
  lessons: { text: string; at?: string }[];
};

const strip = (t: string) => t.replace(/^\[[^\]]+\]\s*/, "");

export default function ForecasterPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Profile>(`/api/forecasters/${encodeURIComponent(id)}`).then(setP).catch((e) => setErr(e.message));
  }, [id]);

  const agent = AGENTS[id];
  const av = avatar(id);
  const all = p?.scopes.find((s) => s.scope === "all");

  return (
    <>
      <Header />
      <main className="prof">
        <div className="hero" style={{ background: agent?.tint ?? "#fff" }}>
          {agent ? (
            <img src={`/agents/${agent.slug}.png`} alt={p?.name ?? ""} />
          ) : av.img ? (
            <div style={{ height: 200, display: "grid", placeItems: "center" }}>
              <img src={av.img} alt={p?.name ?? ""} style={{ width: 120, height: 120, borderRadius: 30, background: "#fff", padding: av.logo ? 14 : 0, boxShadow: "0 8px 24px -10px #0004", mixBlendMode: "normal" }} />
            </div>
          ) : (
            <div style={{ height: 200, display: "grid", placeItems: "center" }}>
              <span className="runner" style={{ position: "static", transform: "none", width: 120, height: 120, borderRadius: 34, fontSize: 40, background: av.color }}>
                {av.badge}
              </span>
            </div>
          )}
          <h1>{p?.name ?? (id.startsWith("0x") ? short(id) : "…")}</h1>
          <div className="k">{p?.kind === "agent" ? "house agent · learns on Walrus" : p?.kind === "source" ? "public source" : "forecaster"}</div>
          {p?.blurb && <p style={{ fontSize: 14, margin: "10px 0 0" }}>{p.blurb}</p>}
          <div className="stats">
            <div><b>{all ? all.skill.toFixed(2) : "—"}</b><span className="k">skill</span></div>
            <div><b>{all ? pct(all.hitRate) : "—"}</b><span className="k">right</span></div>
            <div><b>{p?.picks.length ?? 0}</b><span className="k">calls</span></div>
          </div>
          {p && p.history.length > 1 && <Spark points={p.history.map((h) => h.w)} color={av.color} />}
        </div>

        <section style={{ minWidth: 0 }}>
          {err && <div className="panel bad">{err}</div>}
          {p?.kind === "agent" && (
            <div className="panel" style={{ marginBottom: 18 }}>
              <span className="k">Notebook · read live from Walrus (lessons:{agent?.slug})</span>
              <h3 style={{ font: "800 22px var(--display)", margin: "6px 0 12px" }}>What it learned from its misses</h3>
              {p.lessons.length === 0 && <p style={{ color: "var(--mute)", margin: 0 }}>No lessons yet. One gets written after every bad miss, and recalled before every new pick.</p>}
              {p.lessons.map((l, j) => (
                <div className="lesson" key={j}>
                  {strip(l.text)}
                </div>
              ))}
            </div>
          )}
          {p && p.scopes.length > 0 && (
            <div className="panel" style={{ marginBottom: 18 }}>
              <span className="k">Record by scope</span>
              <table className="sc">
                <tbody>
                  {p.scopes.map((s) => (
                    <tr key={s.scope}>
                      <td>{s.scope}</td>
                      <td>{s.n} scored</td>
                      <td>{pct(s.hitRate)} right</td>
                      <td className={s.skill >= 0 ? "ok" : "bad"}>skill {s.skill.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="k">Slips</span>
          <div style={{ marginTop: 8 }}>
            {p?.picks.map((t) => (
              <div className="ticket" key={t.id}>
                {t.brier !== undefined && (
                  <span className="stamp" style={{ color: t.correct ? "var(--green)" : "var(--red)", borderColor: t.correct ? "var(--green)" : "var(--red)" }}>
                    {t.correct ? "RIGHT" : "WRONG"}
                  </span>
                )}
                <div style={{ fontWeight: 700 }}>{t.question}</div>
                <div className="mono" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {t.outcomes?.map((o, j) => `${o} ${pct(t.probs[j])}`).join(" · ")}
                  {t.stakeMist && ` · ${sui(t.stakeMist)} SUI on ${t.outcomes?.[t.outcome ?? 0]}`} · {ago(t.placedAt)}
                  {t.brier !== undefined && ` · Brier ${t.brier.toFixed(2)}`}
                </div>
                {t.reasoning && <p>{t.reasoning}</p>}
                {t.lessonsUsed.length > 0 && <p style={{ fontWeight: 600 }}>Applied lesson: {t.lessonsUsed[0]}</p>}
                {t.tx && (
                  <a className="k" href={`https://suiscan.xyz/mainnet/tx/${t.tx}`} target="_blank" rel="noreferrer">
                    ticket on Sui ↗
                  </a>
                )}
              </div>
            ))}
            {p && p.picks.length === 0 && <div className="panel">No slips yet.</div>}
          </div>
        </section>
      </main>
    </>
  );
}

function Spark({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 1.2);
  const min = Math.min(...points, 0.8);
  const xy = points.map((v, j) => `${(j / (points.length - 1)) * 260},${40 - ((v - min) / (max - min || 1)) * 36}`).join(" ");
  return (
    <div style={{ marginTop: 12, background: "#ffffffb0", borderRadius: 12, padding: 8 }}>
      <div className="k" style={{ textAlign: "left" }}>trust weight over time</div>
      <svg viewBox="0 0 260 44" style={{ width: "100%", height: 44 }} preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="2.5" points={xy} />
      </svg>
    </div>
  );
}
