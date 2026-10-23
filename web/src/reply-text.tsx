import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// A coordinator reply, with its Markdown formatted, such as bold labels and numbered
// lists (systems design section 4). GitHub's tables are formatted too. Raw HTML in the
// text is shown as text, never run.
export function ReplyText({ text }: { text: string }) {
  return (
    <div className="card reply formatted">
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: NewTabLink }}>
        {text}
      </Markdown>
    </div>
  );
}

// A link opens in a new tab, so the chat stays open while its turn runs.
function NewTabLink({ href, title, children }: ComponentProps<"a">) {
  return (
    <a href={href} title={title} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
