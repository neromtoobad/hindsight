"use client";
import { useEffect, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { CHARACTERS, TINTS, cleanName, profileMessage, type CharacterId } from "@/lib/profile";
import { api, short } from "./meta";

const LABEL: Record<CharacterId, string> = {
  fox: "Scarf Fox",
  cat: "DJ Cat",
  frog: "Shades Frog",
  bear: "King Bear",
  panda: "Boba Panda",
  penguin: "Bucket Penguin",
  dino: "Cap Dino",
  ghost: "Party Ghost",
  mushroom: "Shroom",
  bee: "Visor Bee",
  alien: "Signal Alien",
  octopus: "Top-hat Octopus",
};

export type Me = { name: string; avatar?: string | null; tint?: string | null } | null;

/** Open from anywhere with window.dispatchEvent(new Event("hs:character")). */
export const openCharacter = () => window.dispatchEvent(new Event("hs:character"));

export function CharacterBuilder() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<CharacterId>("fox");
  const [tint, setTint] = useState<string>(TINTS[4]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("hs:character", h);
    return () => window.removeEventListener("hs:character", h);
  }, []);

  // Start from the saved character when there is one.
  useEffect(() => {
    if (!open || !account) return;
    api<{ name: string; avatar?: CharacterId; tint?: string }>(`/api/forecasters/${account.address}`)
      .then((p) => {
        if (p.avatar) setAvatar(p.avatar);
        if (p.tint) setTint(p.tint);
        if (p.name && !p.name.includes("…")) setName(p.name);
      })
      .catch(() => {});
  }, [open, account]);

  if (!open) return null;

  async function save() {
    if (!account) return setErr("Connect your wallet first.");
    const n = cleanName(name);
    if (n.length < 2) return setErr("Pick a name: 2 to 18 letters or numbers.");
    setBusy(true);
    setErr(null);
    try {
      const issuedAt = new Date().toISOString();
      const msg = profileMessage({ address: account.address, name: n, avatar, tint, issuedAt });
      const { signature } = await kit.signPersonalMessage({ message: new TextEncoder().encode(msg) });
      await api("/api/profile", { address: account.address, name: n, avatar, tint, issuedAt, signature });
      window.dispatchEvent(new Event("hs:profile"));
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalbg" onClick={() => setOpen(false)}>
      <div className="builder" role="dialog" aria-label="Make your character" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
        <div className="bpreview" style={{ background: tint }}>
          <img src={`/players/${avatar}.png`} alt={LABEL[avatar]} />
          <div className="bname">{cleanName(name) || "Your name"}</div>
          <div className="k">{account ? short(account.address) : "not connected"}</div>
        </div>
        <div className="bcontrols">
          <h2>Make your character</h2>
          <p className="hint2">This is you on every line, in the race, and on your receipts. Saving asks your wallet to sign a message: no transaction, no gas.</p>
          <label className="k">Character</label>
          <div className="bgrid">
            {CHARACTERS.map((c) => (
              <button key={c} className={c === avatar ? "on" : ""} onClick={() => setAvatar(c)} title={LABEL[c]} style={{ background: c === avatar ? tint : undefined }}>
                <img src={`/players/${c}-head.png`} alt={LABEL[c]} />
              </button>
            ))}
          </div>
          <label className="k">Colour</label>
          <div className="btints">
            {TINTS.map((t) => (
              <button key={t} className={t === tint ? "on" : ""} style={{ background: t }} onClick={() => setTint(t)} aria-label={`Colour ${t}`} />
            ))}
          </div>
          <label className="k" htmlFor="pname">
            Name
          </label>
          <input id="pname" className="bin" value={name} maxLength={18} placeholder="e.g. Nerom" onChange={(e) => setName(e.target.value)} />
          {err && <p className="bad" style={{ margin: 0, fontSize: 13 }}>{err}</p>}
          <button className="placebtn" disabled={busy} onClick={save}>
            {busy ? "Sign in your wallet…" : account ? `Save ${LABEL[avatar]}` : "Connect wallet first"}
          </button>
        </div>
      </div>
    </div>
  );
}
