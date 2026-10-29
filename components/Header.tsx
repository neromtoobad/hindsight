"use client";
import { CATS } from "./meta";
import { WalletButton } from "./Wallet";
import { Mark } from "./Logo";

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
