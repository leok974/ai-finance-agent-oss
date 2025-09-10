import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

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
}
