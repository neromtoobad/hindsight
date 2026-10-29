// Player characters. A profile change is signed by the wallet (personal message), so only the
// owner of an address can set its name and character.
export const CHARACTERS = [
  "fox", "cat", "frog", "bear", "panda", "penguin",
  "dino", "ghost", "mushroom", "bee", "alien", "octopus",
] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export const TINTS = ["#ffe3df", "#fff0d6", "#f4f9c8", "#dcf6ea", "#dcefff", "#e7e6ff", "#f8e1f4", "#ecebe8"] as const;

export function profileMessage(p: { address: string; name: string; avatar: string; tint: string; issuedAt: string }) {
  return `Hindsight profile\naddress: ${p.address}\nname: ${p.name}\ncharacter: ${p.avatar}\ncolour: ${p.tint}\nissued: ${p.issuedAt}`;
}

export const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} _.\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 18);
