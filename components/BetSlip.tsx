"use client";
import { useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { AGENTS, api, ago, avatar, catColor, payout, pct, sui, type Card, type PickV } from "./meta";
import { Stage, type You } from "./Line";
import { leagueName, odds } from "./MarketCard";

export type Selection = { card: Card; you: You };
type Tab = "slip" | "bets";
const QUICK = ["0.01", "0.05", "0.1", "0.5", "1"];

async function signAndRun(kit: ReturnType<typeof useDAppKit>, bytes: string) {
  const res = (await kit.signAndExecuteTransaction({ transaction: Transaction.from(bytes) })) as unknown as {
    $kind?: string;
    Transaction?: { digest: string };
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
  setYou,
  clear,
  bets,
  reloadBets,
  toast,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  selection: Selection | null;
  setYou: (y: You) => void;
  clear: () => void;
  bets: PickV[];
  reloadBets: () => void;
  toast: (s: string) => void;
}) {
  const open = bets.filter((b) => b.status === "open").length;
  return (
    <div className="slippanel" id="slip">
      <div className="tabs">
        <button className={tab === "slip" ? "on" : ""} onClick={() => setTab("slip")}>
          Bet slip{selection ? " · 1" : ""}
        </button>
        <button className={tab === "bets" ? "on" : ""} onClick={() => setTab("bets")}>
          My bets{open ? ` · ${open}` : ""}
        </button>
      </div>
      {tab === "slip" ? (
        <Slip selection={selection} setYou={setYou} clear={clear} toast={toast} onPlaced={() => { reloadBets(); setTab("bets"); }} />
      ) : (
        <Receipts bets={bets} reload={reloadBets} toast={toast} />
      )}
    </div>
  );
}

function Slip({ selection, setYou, clear, toast, onPlaced }: { selection: Selection | null; setYou: (y: You) => void; clear: () => void; toast: (s: string) => void; onPlaced: () => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [stake, setStake] = useState("0.1");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);

  if (!selection)
    return (
      <div className="slipbody empty-slip">
        <img src="/agents/quant.png" alt="" style={{ height: 96 }} />
        <b>Pick a side</b>
        <span>Tap a price, or drag yourself onto any market&apos;s line. You can also tail an agent you trust.</span>
      </div>
    );

  const { card, you } = selection;
  const n = Number(stake);
  const valid = Number.isFinite(n) && n >= 0.01 && n <= 5;
  const mist = valid ? BigInt(Math.round(n * 1e9)) : 0n;
  const toWin = valid ? n * payout(card.poolMist, you.outcome, mist) : 0;
  const pickName = card.outcomes[you.outcome];
  // Tail: the most trusted agents on this market, one tap copies their stance.
  const tails = card.stands
    .filter((s) => AGENTS[s.id])
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((s) => {
      const top = s.probs.indexOf(Math.max(...s.probs));
      return { s, top, conf: Math.max(card.outcomes.length === 2 ? 0.5 : 0.34, Math.min(0.99, s.probs[top])) };
    });

  async function place() {
    if (!account) return toast("Connect a Sui wallet first (top right).");
    if (!valid) return toast("Stake must be between 0.01 and 5 SUI.");
    setBusy(true);
    try {
      const reasoning = why.trim();
      const { bytes } = await api<{ bytes: string }>("/api/tx/place", {
        marketKey: card.key,
        outcome: you.outcome,
        stakeMist: mist.toString(),
        confidence: you.conf,
        reasoning,
        sender: account.address,
      });
      const digest = await signAndRun(kit, bytes);
      await api("/api/picks", { digest, marketKey: card.key, outcome: you.outcome, confidence: you.conf, reasoning });
      toast(`Printed: ${pickName} · ${stake} SUI · ${pct(you.conf)} sure. Your receipt is on Sui and in Walrus.`);
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
          <button className="x" onClick={clear} aria-label="Remove selection">
            ✕
          </button>
        </div>
        <div className="seltitle">{card.question}</div>
      </div>

      <Stage card={card} you={you} onYou={setYou} />

      <div className="stance">
        <span className="k">You&apos;re backing</span>
        <b>{pickName}</b>
        <span className="mono">{pct(you.conf)} sure · odds {odds(card.trust[you.outcome])}</span>
      </div>

      {tails.length > 0 && (
        <div className="tails">
          {tails.map(({ s, top, conf }) => (
            <button key={s.id} className="tail" onClick={() => setYou({ outcome: top, conf })} title={s.reasoning ?? ""}>
              <img src={avatar(s.id).img} alt="" />
              <span>
                Tail <b>{AGENTS[s.id].short}</b>
                <small>
                  {card.outcomes[top]} {pct(s.probs[top])} · {s.w.toFixed(1)}×
                </small>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="stakerow">
        <div className="stakebox">
          <input aria-label="Stake in SUI" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
          <span>SUI</span>
        </div>
        <div className="towin">
          <span className="k">To win now</span>
          <b>{valid ? toWin.toFixed(3) : "—"}</b>
        </div>
      </div>
      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} className={stake === q ? "on" : ""} onClick={() => setStake(q)}>
            {q}
          </button>
        ))}
      </div>
      <textarea className="why" maxLength={600} placeholder="Why? Optional. It's kept on Walrus and hashed onto your ticket." value={why} onChange={(e) => setWhy(e.target.value)} />
      <p className="hint2">Winners split the pool (2% fee), so “to win” moves as others bet. At fair odds this pays {valid ? (n * Number(odds(card.trust[you.outcome]))).toFixed(3) : "—"} SUI.</p>
      <button className="placebtn" disabled={busy || !valid} onClick={place}>
        {busy ? "Confirm in your wallet…" : account ? `Print my slip · ${valid ? stake : "—"} SUI` : "Connect wallet to bet"}
      </button>
    </div>
  );
}

function Receipts({ bets, reload, toast }: { bets: PickV[]; reload: () => void; toast: (s: string) => void }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [view, setView] = useState<"open" | "settled">("open");
  const [busy, setBusy] = useState<string | null>(null);

  if (!account)
    return (
      <div className="slipbody empty-slip">
        <img src="/agents/skeptic.png" alt="" style={{ height: 96 }} />
        <b>Connect your wallet to see your receipts</b>
        <span>Every bet is a ticket object in your wallet, so your receipts follow you anywhere.</span>
      </div>
    );

  const isOpen = (b: PickV) => b.status === "open";
  const settled = bets.filter((b) => !isOpen(b));
  const won = settled.filter((b) => b.status === "resolved" && b.outcome === b.winner).length;
  const list = bets.filter((b) => (view === "open" ? isOpen(b) : !isOpen(b)));

  async function claim(b: PickV) {
    setBusy(b.ticketId!);
    try {
      const { bytes } = await api<{ bytes: string }>("/api/tx/claim", { ticketId: b.ticketId, sender: account!.address });
      const digest = await signAndRun(kit, bytes);
      await api("/api/tx/claimed", { digest });
      toast("Paid out. The ticket stays in your wallet as your receipt.");
      reload();
    } catch (e) {
      toast(`Claim failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="slipbody">
      <div className="record">
        <div><b>{bets.length}</b><span>bets</span></div>
        <div><b>{settled.length ? `${won}/${settled.length}` : "—"}</b><span>right</span></div>
        <div><b>{sui(bets.reduce((a, b) => a + BigInt(b.stakeMist ?? 0), 0n))}</b><span>SUI staked</span></div>
      </div>
      <div className="seg2">
        <button className={view === "open" ? "on" : ""} onClick={() => setView("open")}>
          Open · {bets.filter(isOpen).length}
        </button>
        <button className={view === "settled" ? "on" : ""} onClick={() => setView("settled")}>
          Settled · {settled.length}
        </button>
      </div>
      {list.length === 0 && <p className="hint2" style={{ textAlign: "center", padding: "18px 0" }}>{view === "open" ? "No open bets." : "Nothing settled yet. Results land after full time."}</p>}
      {list.map((b) => {
        const w = b.status === "resolved" && b.outcome === b.winner;
        const state = b.status === "open" ? "OPEN" : b.status === "void" ? "VOID" : w ? "RIGHT" : "WRONG";
        const owed = !b.claimed && (b.status === "void" || w);
        return (
          <div className={`receipt ${state.toLowerCase()}`} key={b.id}>
            <div className="rtop">
              <span className="k">receipt · {ago(b.placedAt)}</span>
              {state !== "OPEN" && <span className="rstamp">{state}</span>}
            </div>
            <div className="seltitle">{b.question}</div>
            <div className="rline">
              <span>Backed</span>
              <b>{b.outcomes?.[b.outcome ?? 0]}</b>
            </div>
            <div className="rline">
              <span>Stake · sure</span>
              <b className="mono">
                {sui(b.stakeMist)} SUI · {pct(Math.max(...b.probs))}
              </b>
            </div>
            {b.brier !== undefined && (
              <div className="rline">
                <span>Score (Brier)</span>
                <b className="mono">{b.brier.toFixed(2)}</b>
              </div>
            )}
            {b.reasoning && <div className="betwhy">“{b.reasoning}”</div>}
            <div className="perf" />
            <div className="betfoot">
              <a href={`https://suiscan.xyz/mainnet/object/${b.ticketId}`} target="_blank" rel="noreferrer">ticket ↗</a>
              <a href={`https://suiscan.xyz/mainnet/tx/${b.tx}`} target="_blank" rel="noreferrer">tx ↗</a>
              <span>hash {b.noteHash?.slice(0, 8)}</span>
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
