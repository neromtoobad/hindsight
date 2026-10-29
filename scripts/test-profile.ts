// Signs a profile with a throwaway key and checks the API accepts it and rejects tampering.
// Usage: tsx scripts/test-profile.ts [base url]   (use the demo server, never production data)
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { profileMessage } from "../lib/profile";

const base = process.argv[2] ?? "http://localhost:3461";
const kp = new Ed25519Keypair();
const address = kp.toSuiAddress();
const body = { address, name: "Test Fox", avatar: "fox", tint: "#dcefff", issuedAt: new Date().toISOString() };
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(profileMessage(body)));
const post = (b: object) => fetch(`${base}/api/profile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => `${r.status} ${await r.text()}`);

console.log("valid:        ", await post({ ...body, signature }));
console.log("tampered name:", await post({ ...body, name: "Someone Else", signature }));
console.log("wrong wallet: ", await post({ ...body, address: new Ed25519Keypair().toSuiAddress(), signature }));
const prof = await fetch(`${base}/api/forecasters/${address}`).then((r) => r.json());
console.log("stored:       ", { name: prof.name, avatar: prof.avatar, tint: prof.tint });
