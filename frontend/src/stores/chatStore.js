import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import toast from 'react-hot-toast';

export const useChatStore = create((set, get) => ({
  messages: [],
  isLoading: false,
  currentSourceId: null,

  sendMessage: async (message, sourceId) => {
    try {
      set({ isLoading: true });
      
      // Add user message immediately
      const userMessage = { role: 'user', content: message };
      set(state => ({ 
        messages: [...state.messages, userMessage],
        currentSourceId: sourceId
      }));
      
      const response = await axiosInstance.post(`/chat/${sourceId}`, { message });
      
      // Add assistant response
      const assistantMessage = { 
        role: 'assistant', 
        content: response.data.response 
      };
      
      set(state => ({ 
        messages: [...state.messages, assistantMessage]
      }));
      
      return { success: true };
    } catch (error) {
      console.error("Send message error:", error);
      const errorMessage = error.response?.data?.message || "Failed to send message";
      toast.error(errorMessage);
      
      // Remove the user message that failed
      set(state => ({ 
        messages: state.messages.slice(0, -1)
      }));
      
      return { success: false, error: errorMessage };
    } finally {
      set({ isLoading: false });
    }
  },

  clearChat: () => {
    set({ messages: [], currentSourceId: null });
  },

  loadChatForSource: async (sourceId) => {
    try {
      set({ isLoading: true, messages: [], currentSourceId: sourceId });
      const response = await axiosInstance.get(`/chat/${sourceId}`);
      const chats = response.data?.chats || [];

      let loadedMessages = [];
      if (Array.isArray(chats) && chats.length > 0) {
        const latest = chats
          .slice()
          .sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt))
          .pop();
        loadedMessages = latest?.messages || [];
      }

      set({ messages: loadedMessages });
    } catch (error) {
      console.error("Load chat error:", error);
      const message = error.response?.data?.message || "Failed to load chat";
      toast.error(message);
    } finally {
      set({ isLoading: false });
    }
  }
}));