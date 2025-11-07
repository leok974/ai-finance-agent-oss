import React, { Suspense } from 'react';

// Lazy chunk: markdown rendering + plugins loaded only when needed
const LazyMarkdown = React.lazy(async () => {
  const [reactMarkdownMod, remarkGfmMod, rehypeRawMod, rehypeSanitizeMod] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('rehype-raw'),
    import('rehype-sanitize'),
  ]);
  const ReactMarkdown = reactMarkdownMod.default;
  const remarkGfm = remarkGfmMod.default;
  const rehypeRaw = rehypeRawMod.default;
  const rehypeSanitize = rehypeSanitizeMod.default;
  const MarkdownInner = ({ children }: { children: string }) => (
    <div className="prose prose-invert max-w-none prose-headings:text-slate-100 prose-strong:text-white prose-strong:font-semibold prose-a:text-blue-400 prose-ul:text-slate-200 prose-ol:text-slate-200 prose-li:text-slate-200">
      <style>{`
        .prose-invert details {
          margin: 0.5rem 0;
          padding: 0.5rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 0.375rem;
        }
        .prose-invert details summary {
          cursor: pointer;
          font-weight: 500;
          color: rgb(203, 213, 225);
          user-select: none;
        }
        .prose-invert details summary:hover {
          color: rgb(226, 232, 240);
        }
        .prose-invert details[open] summary {
          margin-bottom: 0.5rem;
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
        ]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
  return { default: MarkdownInner };
});

// Allow only a safe subset of elements; include our Explain button control
const sanitizeSchema = {
  tagNames: [
    "a","code","em","strong","p","ul","ol","li","table","thead","tbody","tr","th","td","blockquote","pre","span","button","details","summary"
  ],
  attributes: {
    button: ["data-explain-id", "class"],
    a: ["href","title","rel","target"],
    span: ["class"],
    code: ["class"],
    th: ["align"],
    td: ["align"],
    details: ["open"],
    summary: []
  }
};

export default function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="text-xs opacity-60">Rendering…</div>}>
      <LazyMarkdown>{children}</LazyMarkdown>
    </Suspense>
  );
}
