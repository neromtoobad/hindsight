"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { MemoryWrite } from "@/lib/types";
import { Header } from "@/components/Header";
import { Board, type Selection } from "@/components/Board";
import { SlipPanel } from "@/components/BetSlip";
import { Race } from "@/components/Race";
import { MemoryFeed } from "@/components/Memory";
import { Ask } from "@/components/Ask";
import { CATS, api, type Card, type PickV, type Row } from "@/components/meta";

type State = {
  stats: { markets: number; open: number; resolved: number; picks: number; stakedMist: string; memories: number };
  open: Card[];
  awaiting: Card[];
  settled: Card[];
  leaderboard: Row[];
};

export default function Home() {
  const account = useCurrentAccount();
  const [state, setState] = useState<State | null>(null);
  const [memory, setMemory] = useState<MemoryWrite[]>([]);
  const [bets, setBets] = useState<PickV[]>([]);
  const [cat, setCat] = useState("all");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<"slip" | "bets">("slip");
  const [sheet, setSheet] = useState(false);
  const [toastMsg, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<State>("/api/state").then(setState).catch(() => {});
    api<MemoryWrite[]>("/api/memory").then(setMemory).catch(() => {});
  }, []);
  const loadBets = useCallback(() => {
    if (!account) return setBets([]);
    api<{ picks: PickV[] }>(`/api/forecasters/${account.address}`)
      .then((p) => setBets(p.picks))
      .catch(() => setBets([]));
  }, [account]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    loadBets();
    const t = setInterval(loadBets, 30_000);
    return () => clearInterval(t);
  }, [loadBets]);

  const toast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 6000);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state?.open.length ?? 0 };
    for (const m of state?.open ?? []) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [state]);
  const cards = (state?.open ?? []).filter((m) => cat === "all" || m.category === cat);
  const mine = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const b of bets) if (b.outcome !== undefined) m.set(b.marketKey, [...(m.get(b.marketKey) ?? []), b.outcome]);
    return m;
  }, [bets]);
  const openBets = bets.filter((b) => b.status === "open").length;

  const showBets = () => {
    setTab("bets");
    setSheet(true);
    document.getElementById("slip")?.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <Header cat={cat} setCat={setCat} counts={counts} myBets={account ? openBets : undefined} onMyBets={showBets} />
      <main className="book">
        <nav className="sidenav">
          <span className="k" style={{ padding: "0 12px" }}>Markets</span>
          {CATS.filter((c) => c.id === "all" || counts[c.id]).map((c) => (
            <button key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
              <span>
                {c.icon}&nbsp;&nbsp;{c.id === "all" ? "All markets" : c.label}
              </span>
              <span className="n">{counts[c.id] ?? 0}</span>
            </button>
          ))}
          {state && (
            <div className="sidestats k">
              <span>{state.stats.resolved} settled</span>
              <span>{state.stats.picks} bets placed</span>
              <span>{(Number(state.stats.stakedMist) / 1e9).toFixed(2)} SUI staked</span>
              <span>{state.stats.memories} memories on Walrus</span>
            </div>
          )}
        </nav>

        <section style={{ minWidth: 0 }}>
          {state ? (
            <Board
              cards={cards}
              mine={mine}
              selected={selection}
              onSelect={(s) => {
                setSelection(s);
                setTab("slip");
                setSheet(true);
              }}
            />
          ) : (
            <div className="empty">Loading markets…</div>
          )}
        </section>

        <aside className={`side right ${sheet ? "sheet" : ""}`}>
          <button className="sheetclose" onClick={() => setSheet(false)}>
            ✕ Close
          </button>
          <SlipPanel tab={tab} setTab={setTab} selection={selection} clear={() => setSelection(null)} bets={bets} reloadBets={() => { loadBets(); load(); }} toast={toast} />
          <Race rows={state?.leaderboard ?? []} you={account?.address} />
          <Ask />
          <MemoryFeed items={memory} stored={state?.stats.memories ?? 0} />
        </aside>
      </main>

      {!sheet && (selection || openBets > 0) && (
        <button className="slipbar" onClick={() => setSheet(true)}>
          <span>{selection ? `Bet slip · ${selection.card.outcomes[selection.outcome]}` : `My bets · ${openBets} open`}</span>
          <b>{selection ? "Place bet →" : "View →"}</b>
        </button>
      )}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
