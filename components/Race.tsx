"use client";
import { avatar, type Row } from "./meta";

export function Race({ rows, you }: { rows: Row[]; you?: string }) {
  const lanes = rows.filter((r) => r.picks > 0 || r.kind !== "human").slice(0, 8);
  const scored = rows.reduce((a, r) => a + r.n, 0);
  // Early on everyone's skill sits near zero, so place runners relative to the field:
  // the sharpest leads at 90%, the weakest trails at 14%. Unscored runners wait at the start.
  const live = lanes.filter((r) => r.n > 0).map((r) => r.skill);
  const lo = Math.min(...live, 0);
  const hi = Math.max(...live, 0);
  const pos = (skill: number, n: number) => (n === 0 ? 6 : hi - lo < 1e-6 ? 50 : 14 + ((skill - lo) / (hi - lo)) * 66);
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="k">🏁 The race · all markets</span>
        <span className="k">{scored ? `${scored} calls scored · skill →` : "starts at the first result"}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        {lanes.map((r) => {
          const a = avatar(r.id, r);
          const x = pos(r.skill, r.n);
          const moved = Math.abs(r.trend) > 0.02;
          const trailFrom = moved ? Math.max(6, Math.min(92, x - Math.sign(r.trend) * Math.min(30, Math.abs(r.trend) * 40))) : x;
          return (
            <a className="lane" key={r.id} href={`/f/${encodeURIComponent(r.id)}`}>
              <span className="name" style={r.id === you ? { color: "var(--politics)" } : undefined}>
                {r.id === you ? "You" : r.name}
              </span>
              <div className="track">
                {moved && <div className="trail" style={{ left: `${Math.min(trailFrom, x)}%`, width: `${Math.abs(x - trailFrom)}%`, background: a.color }} />}
                {a.img ? (
                  <img className={`runner${a.logo ? " logo" : ""}`} src={a.img} style={{ left: `${x}%`, background: r.avatar ? a.color : undefined }} alt={r.name} />
                ) : (
                  <span className="runner" style={{ left: `${x}%`, background: a.color }}>{a.badge}</span>
                )}
                <span
                  className={`delta ${r.trend > 0.02 ? "ok" : r.trend < -0.02 ? "bad" : ""}`}
                  style={x > 66 ? { right: `calc(${100 - x}% + 24px)` } : { left: `calc(${x}% + 24px)` }}
                >
                  {r.n === 0 ? "warming up" : moved ? `${r.trend > 0 ? "▲" : "▼"}${Math.abs(r.trend).toFixed(1)}` : `${r.n} scored`}
                </span>
                <div className="finish" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
