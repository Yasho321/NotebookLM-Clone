import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  Plus,
  MessageSquare,
  FileText,
  ChevronDown,
  Layers,
  Sparkles,
} from "lucide-react";
import { useChatStore } from '../stores/chatStore';
import { useSourceStore } from '../stores/sourceStore';
import MessageContent from './MessageContent';
import { toast } from 'sonner';

export default function ChatPanel() {
  const { sources, selectedSourceIds } = useSourceStore();
  const {
    chats,
    activeChatId,
    activeChat,
    messages,
    isStreaming,
    streamingContent,
    streamingCitations,
    fetchChats,
    createChat,
    selectChat,
    sendMessageStream,
    stopGeneration,
    regenerateMessage,
    startNewChat,
  } = useChatStore();

  const [inputMessage, setInputMessage] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const menuRef = useRef(null);

  // Initialize chats on mount (auto-select latest existing chat on first load)
  useEffect(() => {
    fetchChats(true);
  }, [fetchChats]);

  // Close chat menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll on new messages or streaming tokens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Adjust textarea height dynamically
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;
    const msg = inputMessage;
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessageStream(msg);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyMessage = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleNewChat = () => {
    setShowChatMenu(false);
    startNewChat();
    toast.info("Started new dialogue. Select sources from the Library to begin.");
  };

  // Find index of last assistant message to attach Regenerate button
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  const activeSourcesCount = selectedSourceIds.length;
  const currentChatTitle = activeChat?.title || (activeChatId ? 'Current Dialogue' : 'New Dialogue');

  return (
    <div className="h-full flex flex-col bg-background relative">
      {/* Chat Session Top Bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0 bg-background/95 backdrop-blur-xs">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowChatMenu(!showChatMenu)}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-muted-foreground transition-colors py-1 px-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
          >
            <span className="truncate max-w-[180px]">{currentChatTitle}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
          </button>

          {/* Chat Sessions Dropdown */}
          {showChatMenu && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 p-1.5 space-y-1">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/60">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Conversations
                </span>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {chats.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => {
                      selectChat(c._id);
                      setShowChatMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      activeChatId === c._id
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span className="truncate pr-2">{c.title || 'Untitled Dialogue'}</span>
                    <span className="text-[10px] opacity-60 flex-shrink-0">
                      {new Date(c.updatedAt || c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
                {chats.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3">
                    No past dialogues
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action icons on right */}
        <div className="flex items-center gap-2">
          {/* Active sources pill */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/60"
            title={`${activeSourcesCount} sources currently queried`}
          >
            <Layers className="w-3 h-3" />
            <span>{activeSourcesCount} active</span>
          </div>

          {/* New Chat Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded cursor-pointer"
            title="Start a new dialogue"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-12 max-w-sm mx-auto animate-fade-in-up">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {activeChatId ? (activeChat?.title || 'Research Dialogue') : 'New Research Dialogue'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              {activeChatId
                ? 'Ask specific questions or uncover key findings across the sources locked to this dialogue.'
                : 'Select sources in the Library, then ask a question or explore a prompt to begin this dialogue.'}
            </p>

            {/* Quick suggested prompt chips */}
            {activeSourcesCount > 0 && (
              <div className="flex flex-col gap-1.5 text-left">
                <button
                  type="button"
                  onClick={() => sendMessageStream("Provide an executive summary of the key findings in these documents.")}
                  className="text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 p-2 rounded-md border border-border/60 transition-colors text-left cursor-pointer"
                >
                  "Provide an executive summary of the key findings..."
                </button>
                <button
                  type="button"
                  onClick={() => sendMessageStream("What are the main methodologies or arguments presented?")}
                  className="text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 p-2 rounded-md border border-border/60 transition-colors text-left cursor-pointer"
                >
                  "What are the main methodologies or arguments presented?"
                </button>
                <button
                  type="button"
                  onClick={() => sendMessageStream("Compare the core themes and identify any conflicting evidence.")}
                  className="text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 p-2 rounded-md border border-border/60 transition-colors text-left cursor-pointer"
                >
                  "Compare the core themes and identify any conflicting evidence."
                </button>
              </div>
            )}
          </div>
        )}

        {/* Existing Messages */}
        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          const isLastAssistant = index === lastAssistantIndex && !isStreaming;

          return (
            <div
              key={index}
              className={`animate-fade-in-up group ${isUser ? 'text-right' : 'text-left'}`}
            >
              {isUser ? (
                <div className="inline-block text-left max-w-[85%] bg-muted/40 px-3.5 py-2.5 rounded-lg border border-border/60">
                  <p className="text-body text-foreground" style={{ color: 'var(--chat-user)' }}>
                    {message.content}
                  </p>
                </div>
              ) : (
                <div className="max-w-[95%] space-y-2">
                  <MessageContent content={message.content} />

                  {/* Inline Citations (Top 3 Only) */}
                  {Array.isArray(message.citations) && message.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Citations:
                      </span>
                      {message.citations.slice(0, 3).map((c, cIdx) => (
                        <span
                          key={cIdx}
                          onClick={() => {
                            const match = sources.find(
                              (s) =>
                                (c.sourceId && (s._id === c.sourceId || s.id === c.sourceId)) ||
                                s.originalFileName === c.originalFileName ||
                                s.title === c.originalFileName
                            );
                            if (match) selectSource(match);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-muted/60 text-foreground border border-border/60 hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                          title={c.snippet ? `"${c.snippet}"` : undefined}
                        >
                          <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{c.originalFileName || 'Document'}</span>
                          {c.pageNumber && (
                            <span className="text-muted-foreground font-mono text-[10px]">p.{c.pageNumber}</span>
                          )}
                        </span>
                      ))}
                      {message.citations.length > 3 && (
                        <span
                          className="inline-flex items-center text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 cursor-default"
                          title={message.citations
                            .slice(3)
                            .map((c) => c.originalFileName || 'Document')
                            .join(', ')}
                        >
                          +{message.citations.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions row: Copy & Regenerate */}
                  <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(message.content, index)}
                      className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                      title="Copy response"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {isLastAssistant && (
                      <button
                        type="button"
                        onClick={regenerateMessage}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-0.5 px-1.5 rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Regenerate this response"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Regenerate</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* In-Flight Streaming Message */}
        {isStreaming && (
          <div className="text-left max-w-[95%] space-y-2 animate-fade-in-up">
            {streamingContent ? (
              <div>
                <MessageContent content={streamingContent} />
                <span className="inline-block w-1.5 h-4 ml-1 bg-foreground animate-pulse align-middle" />
              </div>
            ) : (
              <div className="flex items-center gap-1 py-2">
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                <div className="thinking-dot" />
              </div>
            )}

            {/* Live citations streamed during retrieval (Top 3 Only) */}
            {streamingCitations.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Citations:
                </span>
                {streamingCitations.slice(0, 3).map((c, cIdx) => (
                  <span
                    key={cIdx}
                    onClick={() => {
                      const match = sources.find(
                        (s) =>
                          (c.sourceId && (s._id === c.sourceId || s.id === c.sourceId)) ||
                          s.originalFileName === c.originalFileName ||
                          s.title === c.originalFileName
                      );
                      if (match) selectSource(match);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-muted/60 text-foreground border border-border/60 hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                    title={c.snippet ? `"${c.snippet}"` : undefined}
                  >
                    <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate max-w-[140px]">{c.originalFileName || 'Document'}</span>
                    {c.pageNumber && <span className="text-muted-foreground font-mono text-[10px]">p.{c.pageNumber}</span>}
                  </span>
                ))}
                {streamingCitations.length > 3 && (
                  <span
                    className="inline-flex items-center text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 cursor-default"
                    title={streamingCitations
                      .slice(3)
                      .map((c) => c.originalFileName || 'Document')
                      .join(', ')}
                  >
                    +{streamingCitations.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>


      {/* Input Section */}
      <div className="px-5 py-3 border-t border-border flex-shrink-0 bg-background">
        <div className="flex items-end gap-2 bg-muted/20 border border-border rounded-lg p-1.5 focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-foreground/5 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              activeSourcesCount === 0
                ? "Select sources in the library to start a dialogue..."
                : activeChatId
                ? "Ask about this dialogue's sources... (Shift+Enter for new line)"
                : "Ask a question to start new dialogue... (Shift+Enter for new line)"
            }
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || activeSourcesCount === 0}
            className="w-full resize-none bg-transparent border-0 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden leading-relaxed max-h-40 overflow-y-auto"
          />

          {isStreaming ? (
            <Button
              type="button"
              onClick={stopGeneration}
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-md flex-shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5 fill-destructive" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || activeSourcesCount === 0}
              size="icon"
              className="h-8 w-8 rounded-md flex-shrink-0 shadow-xs"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Footer info line */}
        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-muted-foreground">
          <span>
            {activeSourcesCount === 0 ? (
              <span className="text-destructive">No sources selected</span>
            ) : (
              <span>Grounded in {activeSourcesCount} source{activeSourcesCount > 1 ? 's' : ''}</span>
            )}
          </span>
          <span className="opacity-60 hidden sm:inline">Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}