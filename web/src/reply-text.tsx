import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// A coordinator reply, with its Markdown formatted, such as bold labels and numbered
// lists (systems design section 4). GitHub's tables are formatted too. Raw HTML in the
// text is shown as text, never run.
export function ReplyText({ text }: { text: string }) {
  return (
    <div className="card reply formatted">
      <Markdown
        remarkPlugins={[remarkGfm, remarkLineBreaks]}
        components={{ a: NewTabLink }}
      >
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

// The few fields of a Markdown syntax tree node that remarkLineBreaks reads.
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

// Each line ending in a paragraph or list item shows as a line break, as the
// coordinator wrote it. Markdown alone joins the lines, so one bold label per line
// would run together. Code is left alone, since its text is a value, not text nodes.
function remarkLineBreaks() {
  return (tree: MarkdownNode) => {
    splitLines(tree);
  };
}

function splitLines(node: MarkdownNode): void {
  if (node.children === undefined) {
    return;
  }
  node.children = node.children.flatMap((child) =>
    child.type === "text" ? withBreaks(child.value ?? "") : [child],
  );
  node.children.forEach(splitLines);
}

function withBreaks(value: string): MarkdownNode[] {
  return value
    .split(/\r?\n|\r/)
    .flatMap((line, index) => [
      ...(index === 0 ? [] : [{ type: "break" }]),
      ...(line === "" ? [] : [{ type: "text", value: line }]),
    ]);
}
