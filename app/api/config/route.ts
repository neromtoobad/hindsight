export const dynamic = "force-dynamic";

/** Public ids the browser needs to build a pick transaction. */
export async function GET() {
  return Response.json({
    network: process.env.SUI_NETWORK ?? "mainnet",
    packageId: process.env.HINDSIGHT_PACKAGE_ID ?? null,
    configId: process.env.HINDSIGHT_CONFIG_ID ?? null,
    minStakeMist: "10000000",
    maxStakeMist: "5000000000",
  });
}
