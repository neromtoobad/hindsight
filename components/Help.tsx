/** A small "?" that opens the matching section of the guide. */
export function Help({ to, label }: { to: string; label?: string }) {
  return (
    <a className="help" href={`/guide#${to}`} title={label ?? "What's this? Open the guide"} aria-label={label ?? "Open the guide"}>
      ?
    </a>
  );
}
