"use client";
import { createDAppKit, DAppKitProvider } from "@mysten/dapp-kit-react";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

// The wallet only signs and submits. Transactions are built server-side through Tatum.
const dAppKit = createDAppKit({
  networks: ["mainnet"],
  defaultNetwork: "mainnet",
  createClient: (network) => new SuiGraphQLClient({ url: "https://graphql.mainnet.sui.io/graphql", network }),
  autoConnect: true,
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>;
}
