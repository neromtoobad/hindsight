"use client";
import { useEffect, useRef, useState } from "react";
import { AGENTS, AGENT_IDS } from "./meta";

type Msg = { role: "user" | "assistant"; content: string };

const BLURB: Record<string, string> = {
  quant: "Anchors on market prices and base rates.",
  contrarian: "Fades favourites when the crowd looks too sure.",
  form: "Momentum, recent results, who's in form.",
  skeptic: "Bets on the status quo and regression to the mean.",
  newsroom: "Reads the latest news before every call.",
};
const SUGGEST = ["Why this call?", "What would change your mind?", "What's in your notebook?", "Who disagrees with you, and why?"];
const store = (slug: string) => `hs.chat.${slug}`;

function load(slug: string): Msg[] {
  try {
    return JSON.parse(localStorage.getItem(store(slug)) ?? "[]");
  } catch {
    return [];
  }
}
function save(slug: string, m: Msg[]) {
  try {
    localStorage.setItem(store(slug), JSON.stringify(m.slice(-30)));
  } catch {}
}

/** The house agents float at the edge of the screen. Tap one to talk to it about its calls. */
export function AgentDock({ marketKey, marketTitle }: { marketKey?: string; marketTitle?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="dock" aria-label="Chat with the agents">
        {AGENT_IDS.map((id, i) => {
          const a = AGENTS[id];
          return (
            <button key={id} className={`dockhead ${open === a.slug ? "on" : ""}`} style={{ animationDelay: `${i * 0.4}s`, background: a.tint }} onClick={() => setOpen(open === a.slug ? null : a.slug)} title={`Chat with ${a.short}`}>
              <img src={`/agents/${a.slug}-head.png`} alt={a.short} />
              <span className="docktip">Chat with {a.short}</span>
            </button>
          );
        })}
      </div>
      {open && <ChatWindow key={open} slug={open} marketKey={marketKey} marketTitle={marketTitle} onClose={() => setOpen(null)} />}
    </>
  );
}

function ChatWindow({ slug, marketKey, marketTitle, onClose }: { slug: string; marketKey?: string; marketTitle?: string; onClose: () => void }) {
  const a = AGENTS[`agent:${slug}`];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState(true);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs(load(slug));
  }, [slug]);
  // Block body on purpose: scrollIntoView returns a Promise in current Chrome, which React would treat as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: slug, marketKey: about ? marketKey : undefined, messages: next.slice(-12) }),
      });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let reply = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: reply }]);
      }
      save(slug, [...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `(${(e as Error).message})` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chatwin" role="dialog" aria-label={`Chat with ${a.short}`}>
      <div className="chathead" style={{ background: a.tint }}>
        <img src={`/agents/${slug}.png`} alt="" />
        <div>
          <b>{a.short === "Quant" || a.short === "Contrarian" || a.short === "Skeptic" ? `The ${a.short}` : a.short}</b>
          <span>{BLURB[slug]}</span>
          <a href={`/f/agent%3A${slug}`}>record & notebook →</a>
        </div>
        <button className="x" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>
      {marketKey && (
        <button className={`about ${about ? "on" : ""}`} onClick={() => setAbout((x) => !x)}>
          {about ? "Talking about" : "Not about"}: <b>{marketTitle?.slice(0, 60)}</b> {about ? "✕" : "↺"}
        </button>
      )}
      <div className="chatbody">
        {msgs.length === 0 && (
          <div className="chatempty">
            <p>Ask me about my calls. I answer from my picks, my record, and the lessons I&apos;ve written to Walrus after my misses.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || <span className="dots">thinking</span>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chatsuggest">
        {SUGGEST.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chatform"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Challenge ${a.short}…`} maxLength={800} />
        <button className="lip" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
      {msgs.length > 0 && (
        <button
          className="k clearchat"
          onClick={() => {
            setMsgs([]);
            save(slug, []);
          }}
        >
          clear chat
        </button>
      )}
    </div>
  );
}
