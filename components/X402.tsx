"use client";
import { useState } from "react";
import { avatar, ago, sui } from "./meta";

export type X402Feed = {
  calls: number;
  totalMist: string;
  recent: { digest: string; at: number; mist: string; payerId: string; payerName: string; marketKey: string; question: string }[];
};

/** Agents paying agents: every paid call to the sharp line, settled in SUI over x402. */
export function X402Panel({ feed }: { feed?: X402Feed }) {
  const [show, setShow] = useState(false);
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="k">x402 · agents paying agents</span>
        <span className="k">{feed ? `${feed.calls} paid · ${sui(feed.totalMist)} SUI` : ""}</span>
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 10px" }}>
        Other agents buy Hindsight&apos;s sharp line per call: <span className="mono">GET /api/sharp/&lt;market&gt;</span> answers{" "}
        <b>402</b>, they pay 0.01 SUI on Sui, retry with the digest, and Tatum verifies it before the line is served.
      </p>
      {(feed?.recent ?? []).slice(0, 5).map((r) => {
        const a = avatar(r.payerId);
        return (
          <div className="mem" key={r.digest}>
            {a.img ? <img src={a.img} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", flex: "none" }} /> : <i>{r.payerName.slice(0, 6)}</i>}
            <span>
              <b>{r.payerName}</b> paid {sui(r.mist)} SUI for the sharp line on “{r.question.slice(0, 70)}”{" "}
              <a className="k" href={`https://suiscan.xyz/mainnet/tx/${r.digest}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                tx ↗
              </a>{" "}
              <span className="k">{ago(r.at)}</span>
            </span>
          </div>
        );
      })}
      {feed && feed.calls === 0 && <p className="hint2">No paid calls yet.</p>}
      <button className="k" style={{ textDecoration: "underline", marginTop: 6 }} onClick={() => setShow((s) => !s)}>
        {show ? "hide" : "try it"}
      </button>
      {show && (
        <pre className="mono" style={{ fontSize: 11, background: "var(--bg)", borderRadius: 10, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>
          {`curl -i https://hindsight.nerom.site/api/sharp/pm%3A562793
# -> 402 + accepts[0].payTo / maxAmountRequired
# pay that much SUI to payTo on mainnet, then:
curl -H "X-PAYMENT: $(echo -n '{"x402Version":1,"scheme":"exact","network":"sui:mainnet","payload":{"digest":"<tx digest>"}}' | base64)" \\
  https://hindsight.nerom.site/api/sharp/pm%3A562793`}
        </pre>
      )}
    </div>
  );
}
