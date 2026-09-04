import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from '../stores/themeStore';

export default function CodeBlock({ children, className, language }) {
  const [copied, setCopied] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="relative group my-4 border border-border rounded-lg overflow-hidden">
      {/* Language label + copy button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-label text-muted-foreground" style={{ fontSize: '10px' }}>
          {language?.toUpperCase() || 'CODE'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all cursor-pointer text-xs",
            "opacity-0 group-hover:opacity-100"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={theme === 'dark' ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: 'var(--font-size-sm)',
          lineHeight: '1.6',
          padding: '16px',
          background: theme === 'dark' ? '#1A1A1A' : '#FAFAF8',
        }}
        className={className}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}