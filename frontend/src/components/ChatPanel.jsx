import { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, MessageSquare } from "lucide-react";
import { useChatStore } from '../stores/chatStore';
import { useSourceStore } from '../stores/sourceStore';
import MessageContent from './MessageContent';

export default function ChatPanel() {
  const { selectedSource } = useSourceStore();
  const { messages, isLoading, sendMessage, loadChatForSource } = useChatStore();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Load chat when source changes
  useEffect(() => {
    const sourceId = selectedSource?._id || selectedSource?.id;
    if (sourceId && sourceId !== 'undefined') {
      loadChatForSource(sourceId);
    }
  }, [selectedSource, loadChatForSource]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const msg = inputMessage;
    setInputMessage('');
    await sendMessage(msg, selectedSource?._id || selectedSource?.id);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // No source selected state
  if (!selectedSource) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-xs animate-fade-in-up">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-meta text-muted-foreground mb-1">
              Select or ingest a source
            </p>
            <p className="text-muted-foreground" style={{ fontSize: '11px' }}>
              Awaiting context...
            </p>
          </div>
        </div>
        {/* Input — disabled */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Ingest sources to chat..."
              disabled
              className="bg-muted/30 border border-border/60 rounded-lg px-3.5 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/40 flex-1 cursor-not-allowed"
            />
            <Button size="sm" disabled className="h-10 px-3.5 opacity-40 cursor-not-allowed">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-meta text-muted-foreground mb-1">
              Start a dialogue about your source
            </p>
            <p className="text-muted-foreground" style={{ fontSize: '11px' }}>
              Ask questions, request summaries, or explore
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`animate-fade-in-up ${message.role === 'user' ? 'text-right' : 'text-left'}`}
            style={{ animationDelay: '0s', animationDuration: '0.3s' }}
          >
            {message.role === 'user' ? (
              <p className="text-body inline-block text-right max-w-[90%]" style={{ color: 'var(--chat-user)' }}>
                {message.content}
              </p>
            ) : (
              <div className="max-w-[95%]">
                <MessageContent content={message.content} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-1 py-2">
            <div className="thinking-dot"></div>
            <div className="thinking-dot"></div>
            <div className="thinking-dot"></div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Ask about your sources..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isLoading}
            className="bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all flex-1 h-10"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            size="icon"
            className="h-10 w-10 rounded-lg shadow-xs flex-shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}