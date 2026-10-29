import path from "node:path";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const env = {
  tatumKey: () => req("TATUM_API_KEY"),
  grpcUrl: process.env.SUI_GRPC_URL ?? "https://sui-mainnet-grpc.gateway.tatum.io",
  network: (process.env.SUI_NETWORK ?? "mainnet") as "mainnet" | "testnet",

  memwalAccountId: () => req("MEMWAL_ACCOUNT_ID"),
  memwalKey: () => req("MEMWAL_PRIVATE_KEY"),
  memwalServer: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
  memoryEnabled: () => Boolean(process.env.MEMWAL_ACCOUNT_ID && process.env.MEMWAL_PRIVATE_KEY),

  resolverSecret: () => req("RESOLVER_SECRET"),
  packageId: () => req("HINDSIGHT_PACKAGE_ID"),
  configId: () => req("HINDSIGHT_CONFIG_ID"),
  resolverCapId: () => req("HINDSIGHT_RESOLVER_CAP_ID"),

  agentModel: process.env.AGENT_MODEL ?? "claude-opus-5-5",
  /** MIST each house agent stakes per pick. 0.02 SUI by default. */
  agentStakeMist: BigInt(process.env.AGENT_STAKE_MIST ?? "20000000"),

  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
};
