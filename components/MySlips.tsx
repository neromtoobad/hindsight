"use client";
import { useEffect, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { api, ago, pct, sui, type PickV } from "./meta";

type Profile = { picks: PickV[] };

export function MySlips({ refresh, toast }: { refresh: number; toast: (s: string) => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [picks, setPicks] = useState<PickV[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return setPicks([]);
    api<Profile>(`/api/forecasters/${account.address}`)
      .then((p) => setPicks(p.picks))
      .catch(() => setPicks([]));
  }, [account, refresh]);

  if (!account)
    return (
      <div className="carbon">
        <div className="k">Your slips · carbon copy</div>
        <div className="big">Connect a Sui wallet to print slips.</div>
        <div className="mono">Each pick mints a ticket on Sui before the event, with your reasoning hashed onto it and kept on Walrus.</div>
      </div>
    );

  const last = picks[0];
  const owed = picks.filter((p) => !p.claimed && (p.status === "void" || (p.status === "resolved" && p.outcome === p.winner)));

  async function claim(p: PickV) {
    setBusy(p.ticketId!);
    try {
      const { bytes } = await api<{ bytes: string }>("/api/tx/claim", { ticketId: p.ticketId, sender: account!.address });
      const res = (await kit.signAndExecuteTransaction({ transaction: Transaction.from(bytes) })) as unknown as { Transaction?: { digest: string }; digest?: string };
      const digest = res.Transaction?.digest ?? res.digest;
      if (digest) await api("/api/tx/claimed", { digest });
      toast("Claimed. The ticket stays in your wallet as the record.");
      setPicks((ps) => ps.map((x) => (x.ticketId === p.ticketId ? { ...x, claimed: true } : x)));
    } catch (e) {
      toast(`Claim failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="carbon">
      <div className="k">Your slips · carbon copy</div>
      {!last && <div className="big">No slips yet. Pick one on the left.</div>}
      {last && (
        <>
          <div className="big">
            {last.outcomes?.[last.outcome ?? 0]} · {sui(last.stakeMist)} SUI · {pct(Math.max(...last.probs))} sure
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{last.question}</div>
          <div className="mono">
            ticket {last.ticketId?.slice(0, 10)}… · note {last.noteHash?.slice(0, 8)}… · {ago(last.placedAt)}
            <br />
            <a href={`https://suiscan.xyz/mainnet/tx/${last.tx}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              view on Sui
            </a>
            {last.brier !== undefined && <> · {last.correct ? "RIGHT ✓" : "WRONG"} · Brier {last.brier.toFixed(2)}</>}
          </div>
        </>
      )}
      {owed.map((p) => (
        <button key={p.ticketId} className="lip" style={{ marginTop: 10, width: "100%" }} disabled={busy === p.ticketId} onClick={() => claim(p)}>
          {busy === p.ticketId ? "Signing…" : `${p.status === "void" ? "Refund" : "Claim winnings"} · ${p.question?.slice(0, 32)}…`}
        </button>
      ))}
      {picks.length > 1 && (
        <a className="k" href={`/f/${account.address}`} style={{ display: "block", marginTop: 10 }}>
          all {picks.length} slips →
        </a>
      )}
    </div>
  );
}
