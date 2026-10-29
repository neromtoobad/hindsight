"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { MemoryWrite } from "@/lib/types";
import { api, type Card, type PickV, type Row } from "./meta";
import type { Selection } from "./BetSlip";
import type { You } from "./Line";
import type { X402Feed } from "./X402";

export type BookState = {
  stats: { markets: number; open: number; resolved: number; picks: number; stakedMist: string; memories: number };
  open: Card[];
  awaiting: Card[];
  settled: Card[];
  leaderboard: Row[];
  x402?: X402Feed;
};

/** Everything the home and market pages share: live data, your bets, the slip, toasts. */
export function useBook() {
  const account = useCurrentAccount();
  const [state, setState] = useState<BookState | null>(null);
  const [memory, setMemory] = useState<MemoryWrite[]>([]);
  const [bets, setBets] = useState<PickV[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<"slip" | "bets">("slip");
  const [sheet, setSheet] = useState(false);
  const [toastMsg, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api<BookState>("/api/state").then(setState).catch(() => {});
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

  // Keep the selected card in step with fresh data (pool, trust line) without losing your stance.
  useEffect(() => {
    if (!selection || !state) return;
    const fresh = state.open.find((c) => c.key === selection.card.key);
    if (fresh && fresh !== selection.card) setSelection({ card: fresh, you: selection.you });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const toast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 6000);
  };

  const held = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const b of bets) if (b.outcome !== undefined && b.status === "open") m.set(b.marketKey, [...(m.get(b.marketKey) ?? []), b.outcome]);
    return m;
  }, [bets]);

  const pick = (card: Card, you: You) => {
    setSelection({ card, you });
    setTab("slip");
    setSheet(true);
  };

  return {
    account,
    state,
    memory,
    bets,
    held,
    selection,
    setSelection,
    setYou: (you: You) => selection && setSelection({ ...selection, you }),
    pick,
    tab,
    setTab,
    sheet,
    setSheet,
    toastMsg,
    toast,
    reload: () => {
      load();
      loadBets();
    },
    openBets: bets.filter((b) => b.status === "open").length,
  };
}
