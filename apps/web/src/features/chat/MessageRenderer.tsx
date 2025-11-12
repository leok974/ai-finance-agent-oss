import ReactMarkdown from "react-markdown";

export function MessageRenderer({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <ReactMarkdown
        components={{
          // Customize rendering for better chat UX
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="ml-4">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="text-gray-300">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-gray-800 px-1 py-0.5 text-sm">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded bg-gray-800 p-2">{children}</pre>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
