import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import toast from 'react-hot-toast';

export const useSourceStore = create((set, get) => ({
  sources: [],
  selectedSource: null,
  isLoading: false,
  isUploading: false,

   fetchSources: async () => {
    try {
      set({ isLoading: true });
      const response = await axiosInstance.get('/source');
      let sources = response.data?.sources || [];
      sources=sources?.reverse();
      set((state) => ({
        sources,
        selectedSource:
          state.selectedSource && sources.find((s) => s._id === state.selectedSource._id)
            ? state.selectedSource
            : (sources[0] || null),
      }));
    } catch (error) {
      console.error('Fetch sources error:', error);
      const message = error.response?.data?.message || 'Failed to fetch sources';
      toast.error(message);
    } finally {
      set({ isLoading: false });
    }
  },
  addTextSource: async (text) => {
    try {
      set({ isUploading: true });
      const response = await axiosInstance.post('/source/text', { text });
      
      const newSource = response.data.source;
      newSource.title = response.data.title;
      newSource.summary = response.data.summary;
      
      set(state => ({ 
        sources: [newSource, ...state.sources],
        selectedSource: newSource
      }));
      
      toast.success("Text source added successfully");
      return { success: true, source: newSource };
    } catch (error) {
      console.error("Add text source error:", error);
      const message = error.response?.data?.message || "Failed to add text source";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      set({ isUploading: false });
    }
  },

  addFileSource: async (file) => {
    try {
      set({ isUploading: true });
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axiosInstance.post('/source/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const newSource = response.data.source;
      newSource.title = response.data.title;
      newSource.summary = response.data.summary;
      
      set(state => ({ 
        sources: [newSource, ...state.sources],
        selectedSource: newSource
      }));
      
      toast.success("File uploaded successfully");
      return { success: true, source: newSource };
    } catch (error) {
      console.error("Add file source error:", error);
      const message = error.response?.data?.message || "Failed to upload file";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      set({ isUploading: false });
    }
  },

  addUrlSource: async (url) => {
    try {
      set({ isUploading: true });
      const response = await axiosInstance.post('/source/web', { url });
      
      const newSource = response.data.source;
      newSource.title = response.data.title;
      newSource.summary = response.data.summary;
      
      set(state => ({ 
        sources: [newSource, ...state.sources],
        selectedSource: newSource
      }));
      
      toast.success("URL source added successfully");
      return { success: true, source: newSource };
    } catch (error) {
      console.error("Add URL source error:", error);
      const message = error.response?.data?.message || "Failed to add URL source";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      set({ isUploading: false });
    }
  },

  selectSource: (source) => {
    set({ selectedSource: source });
  },

  clearSources: () => {
    set({ sources: [], selectedSource: null });
  }

  
}));