import CodeBlock from './CodeBlock';

export default function MessageContent({ content }) {
  const parseContent = (text) => {
    const parts = [];
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index);
        if (beforeText.trim()) {
          parts.push({ type: 'text', content: beforeText });
        }
      }

      const language = match[1] || 'text';
      const code = match[2].trim();
      parts.push({ type: 'code', content: code, language });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText.trim()) {
        parts.push({ type: 'text', content: remainingText });
      }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  // Parse markdown-like text (bold, italic, inline code, headers, lists, tables)
  const renderTextContent = (text) => {
    // Check for tables
    const lines = text.split('\n');
    const tableRegex = /^\|(.+)\|$/;
    const separatorRegex = /^\|[\s\-:]+\|$/;
    
    const elements = [];
    let i = 0;
    
    while (i < lines.length) {
      // Detect table start
      if (tableRegex.test(lines[i]?.trim()) && i + 1 < lines.length && separatorRegex.test(lines[i + 1]?.trim())) {
        const tableLines = [];
        let j = i;
        while (j < lines.length && tableRegex.test(lines[j]?.trim())) {
          tableLines.push(lines[j].trim());
          j++;
        }
        
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
          const rows = tableLines.slice(2).map(row => 
            row.split('|').filter(c => c.trim()).map(c => c.trim())
          );
          
          elements.push(
            <div key={`table-${i}`} className="markdown-content my-4 overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    {headers.map((h, idx) => <th key={idx}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => <td key={cellIdx}>{renderInline(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          i = j;
          continue;
        }
      }
      
      // Headers
      if (lines[i]?.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${i}`} className="text-foreground font-semibold mt-4 mb-2" style={{ fontSize: 'var(--font-size-base)' }}>
            {renderInline(lines[i].slice(4))}
          </h3>
        );
        i++;
        continue;
      }
      if (lines[i]?.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${i}`} className="text-foreground font-semibold mt-5 mb-2" style={{ fontSize: '1.1em' }}>
            {renderInline(lines[i].slice(3))}
          </h2>
        );
        i++;
        continue;
      }
      if (lines[i]?.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${i}`} className="text-foreground font-semibold mt-6 mb-3" style={{ fontSize: '1.3em' }}>
            {renderInline(lines[i].slice(2))}
          </h1>
        );
        i++;
        continue;
      }
      
      // Unordered list items
      if (lines[i]?.match(/^[\-\*]\s/)) {
        const listItems = [];
        while (i < lines.length && lines[i]?.match(/^[\-\*]\s/)) {
          listItems.push(lines[i].replace(/^[\-\*]\s/, ''));
          i++;
        }
        elements.push(
          <ul key={`ul-${i}`} className="markdown-content">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-body text-foreground">{renderInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }
      
      // Ordered list items
      if (lines[i]?.match(/^\d+\.\s/)) {
        const listItems = [];
        while (i < lines.length && lines[i]?.match(/^\d+\.\s/)) {
          listItems.push(lines[i].replace(/^\d+\.\s/, ''));
          i++;
        }
        elements.push(
          <ol key={`ol-${i}`} className="markdown-content">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-body text-foreground">{renderInline(item)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Blockquote
      if (lines[i]?.startsWith('> ')) {
        const quoteLines = [];
        while (i < lines.length && lines[i]?.startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <blockquote key={`bq-${i}`} className="markdown-content">
            <p className="text-body">{renderInline(quoteLines.join(' '))}</p>
          </blockquote>
        );
        continue;
      }
      
      // Empty line
      if (!lines[i]?.trim()) {
        i++;
        continue;
      }
      
      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="text-body text-foreground leading-relaxed mb-3">
          {renderInline(lines[i])}
        </p>
      );
      i++;
    }
    
    return <div>{elements}</div>;
  };

  // Render inline formatting: bold, italic, inline code
  const renderInline = (text) => {
    if (!text) return text;
    
    const parts = [];
    // Process: **bold**, *italic*, `code`
    const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let lastIdx = 0;
    let match;

    while ((match = inlineRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }

      if (match[2]) {
        // Bold
        parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
      } else if (match[3]) {
        // Italic
        parts.push(<em key={match.index}>{match[3]}</em>);
      } else if (match[4]) {
        // Inline code
        parts.push(
          <code key={match.index} className="bg-muted px-1.5 py-0.5 text-foreground" style={{ borderRadius: '2px', fontSize: '0.9em', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" }}>
            {match[4]}
          </code>
        );
      }

      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }

    return parts.length > 0 ? parts : text;
  };

  const parts = parseContent(content);

  return (
    <div>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={index}
              language={part.language}
            >
              {part.content}
            </CodeBlock>
          );
        }
        
        return (
          <div key={index}>
            {renderTextContent(part.content)}
          </div>
        );
      })}
    </div>
  );
}