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
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, sanitizeSchema],
      ]}
    >
      {children}
    </ReactMarkdown>
  );
  return { default: MarkdownInner };
});

// Allow only a safe subset of elements; include our Explain button control
const sanitizeSchema = {
  tagNames: [
    "a","code","em","strong","p","ul","ol","li","table","thead","tbody","tr","th","td","blockquote","pre","span","button"
  ],
  attributes: {
    button: ["data-explain-id", "class"],
    a: ["href","title","rel","target"],
    span: ["class"],
    code: ["class"],
    th: ["align"],
    td: ["align"],
  }
};

export default function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="text-xs opacity-60">Rendering…</div>}>
      <LazyMarkdown>{children}</LazyMarkdown>
    </Suspense>
  );
}
