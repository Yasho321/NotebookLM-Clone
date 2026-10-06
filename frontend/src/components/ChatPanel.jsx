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
  Pencil,
  Trash2,
  X,
  Pin,
  MoreVertical,
  Lock,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useChatStore } from '../stores/chatStore';
import { useSourceStore } from '../stores/sourceStore';
import MessageContent from './MessageContent';
import Citations from './Citations';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function ChatPanel() {
  const { sources, selectedSourceIds, selectSource, jumpToCitation } = useSourceStore();
  const {
    chats,
    activeChatId,
    activeChat,
    messages,
    isStreaming,
    isLoadingMessages,
    streamingContent,
    streamingCitations,
    fetchChats,
    selectChat,
    sendMessageStream,
    stopGeneration,
    regenerateMessage,
    startNewChat,
    renameChat,
    deleteChat,
    togglePinChat,
    setMessageFeedback,
  } = useChatStore();

  const [inputMessage, setInputMessage] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const isReadOnly = Boolean(activeChat?.isReadOnly);
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const atBottomRef = useRef(true); // avoids stale-closure reads inside the scroll effect
  const [showScrollPill, setShowScrollPill] = useState(false);

  // Initialize chats on mount (auto-select latest existing chat on first load)
  useEffect(() => {
    fetchChats(true);
  }, [fetchChats]);

  // Keyboard shortcuts: "/" focuses the composer, "Esc" stops generation.
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        textareaRef.current?.focus();
      } else if (e.key === 'Escape' && isStreaming) {
        stopGeneration();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStreaming, stopGeneration]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollPill(false);
    atBottomRef.current = true;
  };

  // Track whether the user is near the bottom. If they've scrolled up to read, we must
  // NOT auto-scroll on new tokens (that's the "yank-down" annoyance).
  const handleMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    atBottomRef.current = atBottom;
    if (atBottom && showScrollPill) setShowScrollPill(false);
  };

  // Smart auto-scroll: follow new content only when already at the bottom; otherwise
  // surface a "new messages" pill so the user can jump down on their own terms.
  useEffect(() => {
    if (atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowScrollPill(true);
    }
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
    if (isReadOnly) {
      toast.info('This dialogue is read-only because its sources were removed. Start a new dialogue.');
      return;
    }
    const msg = inputMessage;
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    atBottomRef.current = true; // follow the new exchange the user just started
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

  // Clicking a citation chip opens the matching source in the Document viewer at its page.
  const handleCitationSelect = (c) => {
    const match = sources.find(
      (s) =>
        (c.sourceId && (s._id === c.sourceId || s.id === c.sourceId)) ||
        s.originalFileName === c.originalFileName ||
        s.title === c.originalFileName
    );
    if (match) jumpToCitation(match, c.pageNumber);
    else if (selectSource) selectSource(match);
  };

  const handleNewChat = () => {
    setMenuOpen(false);
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
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-muted-foreground transition-colors py-1 px-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              {isReadOnly && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
              <span className="truncate max-w-[180px]">{currentChatTitle}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-72 p-1.5">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-border/60">
              <span className="text-micro font-semibold text-muted-foreground uppercase tracking-wider">
                Conversations
              </span>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-1 text-mini font-medium text-foreground hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {chats.map((c) => {
                const isEditing = editingChatId === c._id;

                if (isEditing) {
                  const saveRename = async () => {
                    const t = editTitle.trim();
                    setEditingChatId(null);
                    if (t && t !== c.title) await renameChat(c._id, t);
                  };
                  return (
                    <div key={c._id} className="flex items-center gap-1 px-1.5 py-1" onKeyDown={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setEditingChatId(null);
                        }}
                        className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-background border border-border focus:border-foreground focus:outline-none"
                      />
                      <button type="button" onClick={saveRename} className="p-1 rounded text-foreground hover:bg-muted cursor-pointer" aria-label="Save title">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingChatId(null)} className="p-1 rounded text-muted-foreground hover:bg-muted cursor-pointer" aria-label="Cancel rename">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={c._id}
                    className={`group flex items-center gap-1 pl-2.5 pr-1 py-1.5 rounded text-xs transition-colors ${
                      activeChatId === c._id
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {c.pinned && <Pin className="w-3 h-3 text-accent flex-shrink-0" fill="currentColor" />}
                    <button
                      type="button"
                      onClick={() => { selectChat(c._id); setMenuOpen(false); }}
                      className="flex-1 min-w-0 text-left cursor-pointer truncate"
                      title={c.title || 'Untitled Dialogue'}
                    >
                      {c.title || 'Untitled Dialogue'}
                    </button>

                    {/* Per-chat actions — nested menu, portaled so it's always clickable */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:text-foreground hover:bg-muted cursor-pointer flex-shrink-0"
                          aria-label="Dialogue actions"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => { setEditTitle(c.title || ''); setEditingChatId(c._id); }}>
                          <Pencil className="w-3.5 h-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => togglePinChat(c._id)}>
                          <Pin className="w-3.5 h-3.5" /> {c.pinned ? 'Unpin' : 'Pin'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={() => deleteChat(c._id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
              {chats.length === 0 && (
                <p className="text-mini text-muted-foreground text-center py-3">
                  No past dialogues
                </p>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Action icons on right */}
        <div className="flex items-center gap-2">
          {/* Active sources pill */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-micro font-medium bg-muted text-muted-foreground border border-border/60"
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
      <div ref={scrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Skeleton while a chat's history loads */}
        {isLoadingMessages && messages.length === 0 && (
          <div className="space-y-6 animate-fade-in" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton" style={{ width: '40%', height: '12px', marginLeft: 'auto' }} />
                <div className="skeleton" style={{ width: '90%', height: '12px' }} />
                <div className="skeleton" style={{ width: '80%', height: '12px' }} />
                <div className="skeleton" style={{ width: '60%', height: '12px' }} />
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && !isStreaming && !isLoadingMessages && (
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

                  {/* Numbered citations — shows only the passages the answer referenced */}
                  <Citations
                    citations={message.citations}
                    content={message.content}
                    onSelect={handleCitationSelect}
                  />

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
                        className="flex items-center gap-1 text-mini text-muted-foreground hover:text-foreground py-0.5 px-1.5 rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Regenerate this response"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Regenerate</span>
                      </button>
                    )}

                    {/* 👍 / 👎 feedback — persisted with the trace id for evaluation */}
                    <span className="flex items-center gap-0.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => setMessageFeedback(index, 'up')}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          message.feedback === 'up'
                            ? 'text-green-600 bg-green-600/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        title="Good response"
                        aria-label="Rate response as good"
                        aria-pressed={message.feedback === 'up'}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMessageFeedback(index, 'down')}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          message.feedback === 'down'
                            ? 'text-destructive bg-destructive/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        title="Bad response"
                        aria-label="Rate response as bad"
                        aria-pressed={message.feedback === 'down'}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* In-Flight Streaming Message */}
        {isStreaming && (
          <div className="text-left max-w-[95%] space-y-2 animate-fade-in-up" aria-live="polite" aria-busy="true">
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

            {/* Live citations streamed during retrieval */}
            <Citations
              citations={streamingCitations}
              content={streamingContent}
              onSelect={handleCitationSelect}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* "New messages" pill — shown only when streaming/new content arrives while the
          user has scrolled up. Clicking jumps to the latest. */}
      {showScrollPill && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium shadow-lg hover:opacity-90 transition-opacity cursor-pointer animate-fade-in-up"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          New messages
        </button>
      )}

      {/* Read-only banner (all sources of this dialogue were deleted) */}
      {isReadOnly && (
        <div className="px-5 py-2 border-t border-border bg-muted/40 flex items-center gap-2 text-mini text-muted-foreground flex-shrink-0">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">This dialogue is read-only — its sources were removed. You can still read it.</span>
          <button
            type="button"
            onClick={handleNewChat}
            className="font-medium text-foreground hover:underline cursor-pointer flex-shrink-0"
          >
            New dialogue
          </button>
        </div>
      )}

      {/* Input Section */}
      <div className="px-5 py-3 border-t border-border flex-shrink-0 bg-background">
        <div className="flex items-end gap-2 bg-muted/20 border border-border rounded-lg p-1.5 focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-foreground/5 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              isReadOnly
                ? "This dialogue is read-only (sources removed)"
                : activeSourcesCount === 0
                ? "Select sources in the library to start a dialogue..."
                : activeChatId
                ? "Ask about this dialogue's sources... (Shift+Enter for new line)"
                : "Ask a question to start new dialogue... (Shift+Enter for new line)"
            }
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || activeSourcesCount === 0 || isReadOnly}
            className="w-full resize-none bg-transparent border-0 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden leading-relaxed max-h-40 overflow-y-auto disabled:opacity-60"
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
              disabled={!inputMessage.trim() || activeSourcesCount === 0 || isReadOnly}
              size="icon"
              className="h-8 w-8 rounded-md flex-shrink-0 shadow-xs"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Footer info line */}
        <div className="flex items-center justify-between mt-2 px-1 text-mini text-muted-foreground">
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