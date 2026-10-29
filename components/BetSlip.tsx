"use client";
import { useEffect, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { api, ago, catColor, payout, pct, sui, type PickV } from "./meta";
import { leagueName, odds, type Selection } from "./Board";

const QUICK = ["0.01", "0.05", "0.1", "0.5", "1"];
type Tab = "slip" | "bets";

async function signAndRun(kit: ReturnType<typeof useDAppKit>, bytes: string) {
  const res = (await kit.signAndExecuteTransaction({ transaction: Transaction.from(bytes) })) as unknown as {
    $kind?: string;
    Transaction?: { digest: string };
    FailedTransaction?: { digest: string };
    digest?: string;
  };
  if (res.$kind === "FailedTransaction") throw new Error("transaction failed on chain");
  const digest = res.Transaction?.digest ?? res.digest;
  if (!digest) throw new Error("wallet returned no digest");
  return digest;
}

export function SlipPanel({
  tab,
  setTab,
  selection,
  clear,
  bets,
  reloadBets,
  toast,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  selection: Selection | null;
  clear: () => void;
  bets: PickV[];
  reloadBets: () => void;
  toast: (s: string) => void;
}) {
  const open = bets.filter((b) => b.brier === undefined && b.status !== "void");
  return (
    <div className="slippanel" id="slip">
      <div className="tabs">
        <button className={tab === "slip" ? "on" : ""} onClick={() => setTab("slip")}>
          Bet slip{selection ? " · 1" : ""}
        </button>
        <button className={tab === "bets" ? "on" : ""} onClick={() => setTab("bets")}>
          My bets{bets.length ? ` · ${open.length} open` : ""}
        </button>
      </div>
      {tab === "slip" ? <Slip selection={selection} clear={clear} toast={toast} onPlaced={() => { reloadBets(); setTab("bets"); }} /> : <MyBets bets={bets} reload={reloadBets} toast={toast} />}
    </div>
  );
}

function Slip({ selection, clear, toast, onPlaced }: { selection: Selection | null; clear: () => void; toast: (s: string) => void; onPlaced: () => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [stake, setStake] = useState("0.1");
  const [conf, setConf] = useState(0.65);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selection) setConf(Math.max(selection.card.outcomes.length === 2 ? 0.5 : 0.34, Math.min(0.95, Number(selection.card.trust[selection.outcome].toFixed(2)) || 0.6)));
  }, [selection?.card.key, selection?.outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selection)
    return (
      <div className="slipbody empty-slip">
        <b>Your bet slip is empty</b>
        <span>Tap a price on the board to add a selection.</span>
      </div>
    );

  const { card, outcome } = selection;
  const stakeNum = Number(stake);
  const valid = Number.isFinite(stakeNum) && stakeNum >= 0.01 && stakeNum <= 5;
  const mist = valid ? BigInt(Math.round(stakeNum * 1e9)) : 0n;
  const poolMult = valid ? payout(card.poolMist, outcome, mist) : 0;
  const total = card.poolMist.reduce((a, x) => a + BigInt(x), 0n);

  async function place() {
    if (!account) return toast("Connect a Sui wallet first (top right).");
    if (!valid) return toast("Stake must be between 0.01 and 5 SUI.");
    setBusy(true);
    try {
      const reasoning = why.trim();
      const { bytes } = await api<{ bytes: string }>("/api/tx/place", { marketKey: card.key, outcome, stakeMist: mist.toString(), confidence: conf, reasoning, sender: account.address });
      const digest = await signAndRun(kit, bytes);
      await api("/api/picks", { digest, marketKey: card.key, outcome, confidence: conf, reasoning });
      toast(`Bet placed: ${card.outcomes[outcome]} · ${stake} SUI. Ticket minted on Sui, memory written to Walrus.`);
      setWhy("");
      clear();
      onPlaced();
    } catch (e) {
      toast(`Bet failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="slipbody">
      <div className="sel" style={{ ["--c" as string]: catColor(card.category) }}>
        <div className="selhead">
          <span className="k">{leagueName(card.league)}</span>
          <button className="x" onClick={clear} aria-label="Remove selection">✕</button>
        </div>
        <div className="seltitle">{card.question}</div>
        <div className="selpick">
          <b>{card.outcomes[outcome]}</b>
          <span className="odd">{odds(card.trust[outcome])}</span>
        </div>
      </div>

      <label className="k" htmlFor="stake">Stake (SUI)</label>
      <div className="stakebox">
        <input id="stake" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
        <span>SUI</span>
      </div>
      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} className={stake === q ? "on" : ""} onClick={() => setStake(q)}>
            {q}
          </button>
        ))}
      </div>

      <label className="k" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>How sure are you?</span>
        <b style={{ color: "var(--ink)" }}>{pct(conf)}</b>
      </label>
      <input className="range" type="range" min={card.outcomes.length === 2 ? 0.5 : 0.34} max={0.99} step={0.01} value={conf} onChange={(e) => setConf(Number(e.target.value))} />
      <p className="hint2">Your confidence is what gets scored. Calibrated beats bold.</p>

      <textarea className="why" maxLength={600} placeholder="Why? (optional, kept on Walrus, hashed onto your ticket)" value={why} onChange={(e) => setWhy(e.target.value)} />

      <div className="returns">
        <div>
          <span>Pool pays now</span>
          <b>{valid ? `${(stakeNum * poolMult).toFixed(3)} SUI` : "—"}</b>
        </div>
        <div>
          <span>At fair odds {odds(card.trust[outcome])}</span>
          <b>{valid ? `${(stakeNum * Number(odds(card.trust[outcome]))).toFixed(3)} SUI` : "—"}</b>
        </div>
        <p className="hint2">
          Parimutuel: winners split the {sui(total)} SUI pool (2% fee), so the payout moves as others bet.
        </p>
      </div>

      <button className="placebtn" disabled={busy || !valid} onClick={place}>
        {busy ? "Confirm in your wallet…" : account ? `Place bet · ${valid ? stake : "—"} SUI` : "Connect wallet to bet"}
      </button>
    </div>
  );
}

function MyBets({ bets, reload, toast }: { bets: PickV[]; reload: () => void; toast: (s: string) => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [view, setView] = useState<"open" | "settled">("open");
  const [busy, setBusy] = useState<string | null>(null);

  if (!account)
    return (
      <div className="slipbody empty-slip">
        <b>Connect your wallet to see your bets</b>
        <span>Every bet is a ticket in your wallet, so they follow you to any device.</span>
      </div>
    );

  const isOpen = (b: PickV) => b.status === "open";
  const list = bets.filter((b) => (view === "open" ? isOpen(b) : !isOpen(b)));

  async function claim(b: PickV) {
    setBusy(b.ticketId!);
    try {
      const { bytes } = await api<{ bytes: string }>("/api/tx/claim", { ticketId: b.ticketId, sender: account!.address });
      const digest = await signAndRun(kit, bytes);
      await api("/api/tx/claimed", { digest });
      toast("Paid out. The ticket stays in your wallet as the record.");
      reload();
    } catch (e) {
      toast(`Claim failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="slipbody">
      <div className="seg2">
        <button className={view === "open" ? "on" : ""} onClick={() => setView("open")}>
          Open · {bets.filter(isOpen).length}
        </button>
        <button className={view === "settled" ? "on" : ""} onClick={() => setView("settled")}>
          Settled · {bets.filter((b) => !isOpen(b)).length}
        </button>
      </div>
      {list.length === 0 && <p className="hint2" style={{ textAlign: "center", padding: "20px 0" }}>{view === "open" ? "No open bets. Tap a price on the board." : "Nothing settled yet."}</p>}
      {list.map((b) => {
        const won = b.status === "resolved" && b.outcome === b.winner;
        const lost = b.status === "resolved" && b.outcome !== b.winner;
        const owed = !b.claimed && (b.status === "void" || won);
        const state = b.status === "open" ? "OPEN" : b.status === "void" ? "VOID" : won ? "WON" : "LOST";
        return (
          <div className={`bet ${state.toLowerCase()}`} key={b.id}>
            <div className="bettop">
              <span className="state">{state}</span>
              <span className="k">{ago(b.placedAt)}</span>
            </div>
            <div className="seltitle">{b.question}</div>
            <div className="selpick">
              <b>{b.outcomes?.[b.outcome ?? 0]}</b>
              <span className="mono">{sui(b.stakeMist)} SUI · {pct(Math.max(...b.probs))} sure</span>
            </div>
            {b.reasoning && <div className="betwhy">“{b.reasoning}”</div>}
            <div className="betfoot">
              <a href={`https://suiscan.xyz/mainnet/object/${b.ticketId}`} target="_blank" rel="noreferrer">ticket ↗</a>
              <a href={`https://suiscan.xyz/mainnet/tx/${b.tx}`} target="_blank" rel="noreferrer">tx ↗</a>
              {b.brier !== undefined && <span>Brier {b.brier.toFixed(2)}</span>}
              {lost && <span className="bad">no payout</span>}
              {b.claimed && <span className="ok">paid ✓</span>}
            </div>
            {owed && (
              <button className="placebtn" style={{ marginTop: 8 }} disabled={busy === b.ticketId} onClick={() => claim(b)}>
                {busy === b.ticketId ? "Confirm in your wallet…" : b.status === "void" ? "Claim refund" : "Claim winnings"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
