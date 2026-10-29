"use client";
import { useState } from "react";
import { useCurrentAccount, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { short } from "./meta";

export function WalletButton({ balance }: { balance?: string | null }) {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const kit = useDAppKit();
  const [open, setOpen] = useState(false);

  if (account)
    return (
      <div className="wallet">
        {balance != null && <span className="pill">{balance} SUI</span>}
        <button className="lip" onClick={() => kit.disconnectWallet()} title="Disconnect">
          {short(account.address)}
        </button>
      </div>
    );

  return (
    <div className="wallet" style={{ position: "relative" }}>
      <button className="lip" onClick={() => setOpen((o) => !o)}>
        Connect wallet
      </button>
      {open && (
        <div className="panel" style={{ position: "absolute", right: 0, top: 52, zIndex: 20, width: 260, boxShadow: "0 20px 40px -10px #0004" }}>
          <div className="k" style={{ marginBottom: 8 }}>Sui wallets</div>
          {wallets.length === 0 && (
            <p style={{ margin: 0, fontSize: 14 }}>
              No Sui wallet found. Install <a href="https://slush.app" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Slush</a> and reload.
            </p>
          )}
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={async () => {
                setOpen(false);
                await kit.connectWallet({ wallet: w });
              }}
              style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", padding: "8px 4px", fontWeight: 700 }}
            >
              {w.icon && <img src={w.icon} alt="" width={24} height={24} style={{ borderRadius: 6 }} />}
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
