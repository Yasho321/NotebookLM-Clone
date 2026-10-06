import { FileText } from 'lucide-react';

/**
 * Renders numbered, clickable citation chips under an assistant message.
 *
 * Chips are numbered [1], [2]… to match the passage numbers the model cites inline.
 * If the answer text references specific passages (e.g. "[1][3]"), we show ONLY those
 * (the passages actually used); otherwise we fall back to showing all retrieved passages.
 * Clicking a chip opens that source in the content panel.
 */
export default function Citations({ citations, content = '', onSelect }) {
  if (!Array.isArray(citations) || citations.length === 0) return null;

  // Which [N] does the answer reference?
  const refs = new Set();
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(content)) !== null) refs.add(Number(m[1]));

  const numbered = citations.map((c, i) => ({ ...c, n: i + 1 }));
  const filtered = refs.size > 0 ? numbered.filter((c) => refs.has(c.n)) : numbered;
  const list = filtered.length > 0 ? filtered : numbered;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
      <span className="text-micro font-semibold text-muted-foreground uppercase tracking-wider">
        Citations:
      </span>
      {list.slice(0, 6).map((c) => (
        <button
          key={c.n}
          type="button"
          onClick={() => onSelect?.(c)}
          className="inline-flex items-center gap-1 text-mini px-2 py-0.5 rounded bg-muted/60 text-foreground border border-border/60 hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
          title={c.snippet ? `"${c.snippet}"` : undefined}
          aria-label={`Open source ${c.originalFileName || 'document'}${c.pageNumber ? `, page ${c.pageNumber}` : ''}`}
        >
          <span className="font-mono text-micro text-muted-foreground">[{c.n}]</span>
          <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate max-w-[140px]">{c.originalFileName || 'Document'}</span>
          {c.pageNumber && (
            <span className="text-muted-foreground font-mono text-micro">p.{c.pageNumber}</span>
          )}
        </button>
      ))}
      {list.length > 6 && (
        <span className="text-micro text-muted-foreground">+{list.length - 6} more</span>
      )}
    </div>
  );
}
