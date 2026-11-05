import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { Header } from "@/components/Header";

export const metadata = {
  title: "Hindsight: a prediction market that remembers who was right",
  description: "What Hindsight does, how it uses Tatum and Walrus Memory, and how its agents learned from being wrong.",
};

// The post lives in submission/blog.md. Spots still marked [[LEARNING: ...]] show highlighted in dev;
// in production the page 404s until every one is filled, so no deploy can ship a half-written post.
export default function Blog() {
  const raw = fs.readFileSync(path.join(process.cwd(), "submission/blog.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const todo = /\[\[LEARNING:[^\]]*\]\]/.test(raw);
  if (todo && process.env.NODE_ENV === "production") notFound();
  const md = raw.replace(/\[\[LEARNING:([^\]]*)\]\]/g, (_, t) => `<mark class="todo">To fill:${t}</mark>`);
  const html = marked.parse(md, { async: false });
  return (
    <>
      <Header />
      <main className="blog">
        <span className="eyebrow">Build log · Tatum × Walrus Total Recall</span>
        <article className="post" dangerouslySetInnerHTML={{ __html: html }} />
        <footer className="lfoot">
          <span>hindsight · call it before it happens</span>
          <a href="/markets">Markets</a>
          <a href="/guide">Guide</a>
          <a href="https://github.com/neromtoobad/hindsight">Code</a>
        </footer>
      </main>
    </>
  );
}
