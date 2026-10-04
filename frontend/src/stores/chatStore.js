import { create } from 'zustand';
import { axiosInstance, BASE_URL } from '../lib/axios';
import { useSourceStore } from './sourceStore';
import { toast } from 'sonner';

/**
 * Robust Server-Sent Events (SSE) stream reader helper.
 * Parses lines formatted as `data: {...}` from a fetch ReadableStream.
 */
async function consumeSSEStream(response, { onMetadata, onToken, onDone, onStopped, onError }) {
  if (!response.body) {
    throw new Error('ReadableStream not supported on this response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep partial trailing line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const rawJson = trimmed.replace(/^data:\s*/, '');
        if (!rawJson) continue;

        try {
          const event = JSON.parse(rawJson);

          if (event.type === 'metadata') {
            onMetadata?.(event);
          } else if (event.type === 'token') {
            let tokenStr = '';
            if (typeof event.content === 'string') {
              tokenStr = event.content;
            } else if (event.content && typeof event.content === 'object') {
              if (Array.isArray(event.content.data)) {
                tokenStr = new TextDecoder().decode(new Uint8Array(event.content.data));
              } else {
                tokenStr = String(event.content.text || event.content.delta || '');
              }
            }
            if (tokenStr) {
              onToken?.(tokenStr);
            }
          } else if (event.type === 'done') {
            onDone?.(event);
          } else if (event.type === 'stopped') {
            onStopped?.(event);
          } else if (event.type === 'error') {
            onError?.(new Error(event.message || 'Stream error'));
          }
        } catch (parseErr) {
          console.warn('Failed to parse SSE line:', parseErr, rawJson);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const useChatStore = create((set, get) => ({
  chats: [],
  activeChatId: null,
  activeChat: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isStreaming: false,
  streamingContent: '',
  streamingCitations: [],
  activeTraceId: null,
  abortController: null,
  lastUserQuery: '',

  /**
   * Fetch all chats for the authenticated user
   */
  fetchChats: async (autoSelectLatest = false) => {
    try {
      set({ isLoadingChats: true });
      const response = await axiosInstance.get('/chat');
      const chats = response.data?.chats || [];
      
      set({ chats });

      // Only auto-select the latest chat on initial mount if explicitly requested
      const currentActive = get().activeChatId;
      if (autoSelectLatest && !currentActive && chats.length > 0) {
        await get().selectChat(chats[0]._id);
      }
    } catch (error) {
      console.error('Fetch chats error:', error);
    } finally {
      set({ isLoadingChats: false });
    }
  },

  /**
   * Optimistically update active chat timestamp and re-order chat list locally
   * without incurring an unnecessary full network refetch after every message.
   */
  touchActiveChat: () => {
    const activeId = get().activeChatId;
    if (!activeId) return;
    const currentChats = get().chats;
    const chatIndex = currentChats.findIndex((c) => c._id === activeId);
    if (chatIndex !== -1) {
      const updatedChat = {
        ...currentChats[chatIndex],
        updatedAt: new Date().toISOString(),
      };
      set({
        chats: [
          updatedChat,
          ...currentChats.slice(0, chatIndex),
          ...currentChats.slice(chatIndex + 1),
        ],
      });
    }
  },

  /**
   * Create a new chat session with specified or currently selected sources
   */
  createChat: async (sourceIds, title = null) => {
    try {
      const selectedSourceIds = sourceIds || useSourceStore.getState().selectedSourceIds;
      if (!selectedSourceIds || selectedSourceIds.length === 0) {
        toast.error('Please select at least one source to chat with');
        return null;
      }

      const response = await axiosInstance.post('/chat', {
        sourceIds: selectedSourceIds,
        title: title || undefined,
      });

      const newChat = response.data?.chat;
      if (newChat) {
        // Lock selectedSourceIds strictly to the newly created chat's sources
        const lockedIds = (newChat.sourceIds || [])
          .map((s) => (typeof s === 'string' ? s : s._id || s.id))
          .filter(Boolean);
        if (lockedIds.length > 0) {
          useSourceStore.setState({ selectedSourceIds: lockedIds });
        }

        set((state) => ({
          chats: [newChat, ...state.chats.filter((c) => c._id !== newChat._id)],
          activeChatId: newChat._id,
          activeChat: newChat,
          messages: [],
          streamingContent: '',
          streamingCitations: [],
        }));
        return newChat;
      }
      return null;
    } catch (error) {
      console.error('Create chat error:', error);
      const msg = error.response?.data?.message || 'Failed to create new chat';
      toast.error(msg);
      return null;
    }
  },

  /**
   * Select and load a chat by ID
   */
  selectChat: async (chatId) => {
    if (!chatId) return;

    // If currently streaming, stop it before switching
    if (get().isStreaming) {
      await get().stopGeneration();
    }

    try {
      set({ isLoadingMessages: true, activeChatId: chatId, streamingContent: '', streamingCitations: [] });
      const response = await axiosInstance.get(`/chat/${chatId}`);
      const chat = response.data?.chat;
      const messages = response.data?.messages || [];

      // Synchronize sourceStore selectedSourceIds to match this chat's locked sourceIds
      const chatSourceIds = (chat?.sourceIds || [])
        .map((s) => (typeof s === 'string' ? s : s._id || s.id))
        .filter(Boolean);

      if (chatSourceIds.length > 0) {
        useSourceStore.setState({ selectedSourceIds: chatSourceIds });
      }

      set({
        activeChatId: chatId,
        activeChat: chat,
        messages,
      });
    } catch (error) {
      console.error('Select chat error:', error);
      const msg = error.response?.data?.message || 'Failed to load chat history';
      toast.error(msg);
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  /**
   * Send a message with real-time token streaming via SSE
   */
  sendMessageStream: async (messageText) => {
    const text = messageText?.trim();
    if (!text || get().isStreaming) return;

    let chatId = get().activeChatId;

    // If no chat session exists yet, automatically initialize one with selected sources
    if (!chatId) {
      const sourceIds = useSourceStore.getState().selectedSourceIds;
      if (!sourceIds || sourceIds.length === 0) {
        toast.error('Please select at least one source from the library');
        return;
      }
      const newChat = await get().createChat(sourceIds, text.slice(0, 40));
      if (!newChat) return;
      chatId = newChat._id;
    }

    const abortCtrl = new AbortController();
    const token = localStorage.getItem('authToken');

    // Add user message optimistically
    const userMsg = { role: 'user', content: text, createdAt: new Date().toISOString() };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
      streamingCitations: [],
      activeTraceId: null,
      abortController: abortCtrl,
      lastUserQuery: text,
    }));

    try {
      const res = await fetch(`${BASE_URL}/chat/${chatId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Request failed with status ${res.status}`);
      }

      let accumulatedText = '';
      let accumulatedCitations = [];

      await consumeSSEStream(res, {
        onMetadata: (data) => {
          if (data.citations) {
            accumulatedCitations = data.citations;
            set({ streamingCitations: data.citations });
          }
          if (data.traceId) {
            set({ activeTraceId: data.traceId });
          }
        },
        onToken: (chunk) => {
          accumulatedText += chunk;
          set({ streamingContent: accumulatedText });
        },
        onDone: (data) => {
          const finalMessages = data.messages || [
            ...get().messages,
            {
              role: 'assistant',
              content: data.fullResponse || accumulatedText,
              citations: data.citations || accumulatedCitations,
              traceId: data.traceId || get().activeTraceId,
            },
          ];

          set({
            messages: finalMessages,
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            abortController: null,
          });

          // Locally touch active chat to update updatedAt and order without network trip
          get().touchActiveChat();
        },
        onStopped: () => {
          // Handled via stopGeneration or server interrupt
          set({ isStreaming: false, abortController: null });
        },
        onError: (err) => {
          throw err;
        },
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        // User aborted intentionally; handled in stopGeneration()
        return;
      }

      console.error('Streaming error:', error);
      toast.error(error.message || 'Error occurred while streaming response');

      // If streaming failed without any content, remove the optimistic user message
      if (!get().streamingContent) {
        set((state) => ({
          messages: state.messages.filter((m) => m !== userMsg),
        }));
      } else {
        // Persist whatever was streamed as assistant message
        set((state) => ({
          messages: [
            ...state.messages,
            {
              role: 'assistant',
              content: state.streamingContent + '\n\n*(Generation interrupted)*',
              citations: state.streamingCitations,
            },
          ],
        }));
      }

      set({
        isStreaming: false,
        streamingContent: '',
        streamingCitations: [],
        abortController: null,
      });
    }
  },

  /**
   * Abort in-flight generation and save partial output
   */
  stopGeneration: async () => {
    const { abortController, activeChatId, streamingContent, streamingCitations, lastUserQuery } = get();

    // 1. Abort local fetch stream
    if (abortController) {
      abortController.abort();
    }

    set({ isStreaming: false, abortController: null });

    if (!activeChatId) return;

    try {
      // 2. Notify backend to abort runner
      await axiosInstance.post(`/chat/${activeChatId}/stop`).catch(() => {});

      // 3. If there is streamed content, save it to the DB so it's not lost
      if (streamingContent && streamingContent.trim()) {
        const response = await axiosInstance.post(`/chat/${activeChatId}/save-partial`, {
          userMessage: lastUserQuery,
          partialResponse: streamingContent.trim(),
          citations: streamingCitations,
        });

        if (response.data?.messages) {
          set({ messages: response.data.messages });
        } else {
          set((state) => ({
            messages: [
              ...state.messages,
              {
                role: 'assistant',
                content: streamingContent.trim(),
                citations: streamingCitations,
              },
            ],
          }));
        }
      }

      set({ streamingContent: '', streamingCitations: [] });
      toast.info('Generation stopped');
    } catch (error) {
      console.error('Stop generation error:', error);
    }
  },

  /**
   * Regenerate the last assistant response via SSE
   */
  regenerateMessage: async () => {
    const { activeChatId, isStreaming, messages } = get();
    if (!activeChatId || isStreaming || messages.length === 0) return;

    // Find the last assistant message and previous user message
    let lastAssistantIdx = -1;
    let userQuery = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && lastAssistantIdx === -1) {
        lastAssistantIdx = i;
      } else if (messages[i].role === 'user' && lastAssistantIdx !== -1) {
        userQuery = messages[i].content;
        break;
      }
    }

    if (lastAssistantIdx === -1) {
      toast.error('No assistant message to regenerate');
      return;
    }

    // Prune the last assistant message from local UI
    const updatedMessages = messages.slice(0, lastAssistantIdx);
    const abortCtrl = new AbortController();
    const token = localStorage.getItem('authToken');

    set({
      messages: updatedMessages,
      isStreaming: true,
      streamingContent: '',
      streamingCitations: [],
      activeTraceId: null,
      abortController: abortCtrl,
      lastUserQuery: userQuery,
    });

    try {
      const res = await fetch(`${BASE_URL}/chat/${activeChatId}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Regenerate failed with status ${res.status}`);
      }

      let accumulatedText = '';
      let accumulatedCitations = [];

      await consumeSSEStream(res, {
        onMetadata: (data) => {
          if (data.citations) {
            accumulatedCitations = data.citations;
            set({ streamingCitations: data.citations });
          }
          if (data.traceId) {
            set({ activeTraceId: data.traceId });
          }
        },
        onToken: (chunk) => {
          accumulatedText += chunk;
          set({ streamingContent: accumulatedText });
        },
        onDone: (data) => {
          const finalMessages = data.messages || [
            ...get().messages,
            {
              role: 'assistant',
              content: data.fullResponse || accumulatedText,
              citations: data.citations || accumulatedCitations,
              traceId: data.traceId || get().activeTraceId,
            },
          ];

          set({
            messages: finalMessages,
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            abortController: null,
          });

          get().touchActiveChat();
        },
        onStopped: () => {
          set({ isStreaming: false, abortController: null });
        },
        onError: (err) => {
          throw err;
        },
      });
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Regenerate error:', error);
      toast.error(error.message || 'Failed to regenerate response');
      set({
        isStreaming: false,
        streamingContent: '',
        streamingCitations: [],
        abortController: null,
      });
    }
  },

  /**
   * Start a new chat session (unlocks source selection in SourcePanel)
   */
  startNewChat: () => {
    if (get().isStreaming) {
      get().stopGeneration();
    }

    // Default to all completed sources so the user can freely toggle for the new chat
    const sources = useSourceStore.getState().sources;
    const completed = sources.filter((s) => s.status === 'completed').map((s) => s._id);
    useSourceStore.setState({
      selectedSourceIds: completed.length > 0 ? completed : sources.map((s) => s._id),
    });

    set({
      activeChatId: null,
      activeChat: null,
      messages: [],
      streamingContent: '',
      streamingCitations: [],
      isStreaming: false,
    });
  },

  /**
   * Reset or clear chat state
   */
  clearChat: () => {
    set({
      messages: [],
      activeChatId: null,
      activeChat: null,
      streamingContent: '',
      streamingCitations: [],
      isStreaming: false,
    });
  },

  /**
   * Backward compatibility alias for loading chat for a specific source
   */
  loadChatForSource: async (sourceId) => {
    if (!sourceId) return;
    const existing = get().chats.find((c) =>
      c.sourceIds?.some((s) => (s._id || s) === sourceId)
    );
    if (existing) {
      await get().selectChat(existing._id);
    } else {
      await get().createChat([sourceId]);
    }
  },
}));