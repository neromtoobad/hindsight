"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { MemoryWrite } from "@/lib/types";
import { Header } from "@/components/Header";
import { Deck } from "@/components/Deck";
import { Race } from "@/components/Race";
import { MemoryFeed } from "@/components/Memory";
import { MySlips } from "@/components/MySlips";
import { Ask } from "@/components/Ask";
import { api, type Card, type Row } from "@/components/meta";

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
  const [cat, setCat] = useState("all");
  const [tick, setTick] = useState(0);
  const [toastMsg, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<State>("/api/state").then(setState).catch(() => {});
    api<MemoryWrite[]>("/api/memory").then(setMemory).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const toast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 5000);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of state?.open ?? []) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [state]);
  const cards = (state?.open ?? []).filter((m) => cat === "all" || m.category === cat);

  return (
    <>
      <Header cat={cat} setCat={setCat} counts={counts} />
      <main className="grid">
        <section style={{ minWidth: 0 }}>
          {state ? (
            <Deck
              key={cat}
              cards={cards}
              toast={toast}
              onPicked={() => {
                load();
                setTick((t) => t + 1);
              }}
            />
          ) : (
            <div className="empty">Loading slips…</div>
          )}
          {state && (
            <div className="k" style={{ marginTop: 18, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <span>{state.stats.open} open</span>
              <span>{state.stats.resolved} settled</span>
              <span>{state.stats.picks} picks</span>
              <span>{(Number(state.stats.stakedMist) / 1e9).toFixed(2)} SUI staked</span>
              <span>{state.stats.memories} memories on Walrus</span>
            </div>
          )}
        </section>
        <aside className="side">
          <Race rows={state?.leaderboard ?? []} you={account?.address} />
          <MySlips refresh={tick} toast={toast} />
          <Ask />
          <MemoryFeed items={memory} stored={state?.stats.memories ?? 0} />
        </aside>
      </main>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
