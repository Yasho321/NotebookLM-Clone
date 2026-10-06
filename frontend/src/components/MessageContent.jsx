import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

/**
 * Renders assistant/user message text as Markdown.
 *
 * Why react-markdown instead of the previous hand-rolled regex parser:
 *  - Correctly handles nested lists, links, blockquotes, GitHub-flavored tables, and
 *    task lists (via remark-gfm).
 *  - Gracefully renders half-finished Markdown while streaming (e.g. an unclosed ```code
 *    fence) instead of producing broken output.
 *  - Styling is reused from the existing `.markdown-content` CSS, so the look is unchanged.
 */
export default function MessageContent({ content }) {
  return (
    <div className="markdown-content text-sm leading-relaxed text-foreground break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Strip the default <pre> wrapper — fenced code is rendered by <CodeBlock/>,
          // which brings its own container, language label, and copy button.
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children ?? '').replace(/\n$/, '');
            const isBlock = Boolean(match) || text.includes('\n');
            if (!isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match ? match[1] : 'text'}>{text}</CodeBlock>;
          },
          // Open links safely in a new tab.
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
