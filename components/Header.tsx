"use client";
import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { CATS, api } from "./meta";
import { openCharacter } from "./Character";
import { WalletButton } from "./Wallet";
import { Mark } from "./Logo";

type Me = { name: string; avatar?: string; tint?: string };

/** Your character chip: opens the builder. Refreshes when the profile is saved. */
function MeChip() {
  const account = useCurrentAccount();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!account) return setMe(null);
    const load = () => api<Me>(`/api/forecasters/${account.address}`).then(setMe).catch(() => setMe(null));
    load();
    window.addEventListener("hs:profile", load);
    return () => window.removeEventListener("hs:profile", load);
  }, [account]);
  if (!account) return null;
  if (!me?.avatar)
    return (
      <button className="mechip make" onClick={openCharacter}>
        <span className="plus">+</span> Make your character
      </button>
    );
  return (
    <button className="mechip" onClick={openCharacter} title="Edit your character">
      <img src={`/players/${me.avatar}-head.png`} alt="" style={{ background: me.tint }} />
      <b>{me.name}</b>
    </button>
  );
}
export function Header({
  cat,
  setCat,
  counts,
  myBets,
  onMyBets,
}: {
  cat?: string;
  setCat?: (c: string) => void;
  counts?: Record<string, number>;
  myBets?: number;
  onMyBets?: () => void;
}) {
  return (
    <header className="top">
      <a className="logo" href="/" aria-label="Hindsight home">
        <Mark size={46} />
        hindsight
      </a>
      {setCat && (
        <nav className="chips mobile-only">
          {CATS.filter((c) => c.id === "all" || counts?.[c.id]).map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
              {c.icon}&nbsp;{c.id === "all" ? "All" : c.label}
              {counts?.[c.id] ? <span className="n">{counts[c.id]}</span> : null}
            </button>
          ))}
        </nav>
      )}
      <div className="wallet">
        <MeChip />
        {onMyBets ? (
          <button className="mybets" onClick={onMyBets}>
            My bets{myBets ? <span className="badge">{myBets}</span> : null}
          </button>
        ) : (
          <a className="mybets" href="/#slip">
            My bets
          </a>
        )}
        <WalletButton />
      </div>
    </header>
  );
}
