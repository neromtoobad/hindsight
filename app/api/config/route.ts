export const dynamic = "force-dynamic";

/** Public ids the browser needs to build a pick transaction. */
export async function GET() {
  return Response.json({
    network: process.env.SUI_NETWORK ?? "mainnet",
    packageId: process.env.RECEIPTS_PACKAGE_ID ?? null,
    configId: process.env.RECEIPTS_CONFIG_ID ?? null,
    minStakeMist: "10000000",
    maxStakeMist: "5000000000",
  });
}
