import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import axios from 'axios';
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
      let rawSources = response.data?.sources || [];
      const sources = rawSources.map(s => ({ ...s, _id: s._id || s.id })).reverse();
      set((state) => {
        const currentSelectedId = state.selectedSource?._id || state.selectedSource?.id;
        return {
          sources,
          selectedSource:
            currentSelectedId && sources.find((s) => s._id === currentSelectedId)
              ? sources.find((s) => s._id === currentSelectedId)
              : (sources[0] || null),
        };
      });

      // Resume polling for any sources still in progress
      sources.forEach((source) => {
        if (source.status === 'queued' || source.status === 'processing') {
          get().pollSourceStatus(source._id);
        }
      });
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
      
      const rawSource = response.data.source;
      const newSource = {
        ...rawSource,
        _id: rawSource._id || rawSource.id,
      };
      
      set(state => ({ 
        sources: [newSource, ...state.sources],
        selectedSource: newSource
      }));
      
      toast.success("Text source queued for processing");
      
      // Start polling for completion
      get().pollSourceStatus(newSource._id);
      
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

      // Determine file MIME type with fallback
      let fileType = file.type;
      if (!fileType) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') fileType = 'application/pdf';
        else if (ext === 'docx') fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === 'csv') fileType = 'text/csv';
        else if (ext === 'txt') fileType = 'text/plain';
      }

      // Step 1: Get presigned URL from our API
      const presignRes = await axiosInstance.post('/source/presign', {
        fileName: file.name,
        fileType: fileType,
        fileSize: file.size,
      });
      const { presignedUrl, source: rawSource } = presignRes.data;
      const source = {
        ...rawSource,
        _id: rawSource._id || rawSource.id,
      };

      // Add source to list immediately (status: 'uploading')
      set(state => ({
        sources: [source, ...state.sources],
        selectedSource: source,
      }));

      // Step 2: Upload file directly to S3 using bare axios (no auth header)
      await axios.put(presignedUrl, file, {
        headers: { 'Content-Type': fileType },
      });

      // Step 3: Confirm upload — triggers BullMQ job
      await axiosInstance.post('/source/confirm-upload', {
        sourceId: source._id,
      });

      // Update local state to 'queued'
      set(state => ({
        sources: state.sources.map(s =>
          (s._id === source._id || s.id === source._id)
            ? { ...s, status: 'queued' }
            : s
        ),
        selectedSource:
          (state.selectedSource?._id === source._id || state.selectedSource?.id === source._id)
            ? { ...state.selectedSource, status: 'queued' }
            : state.selectedSource,
      }));

      toast.success("File uploaded! Processing started.");

      // Step 4: Start polling for completion
      get().pollSourceStatus(source._id);

      return { success: true, source };
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
      
      const rawSource = response.data.source;
      const newSource = {
        ...rawSource,
        _id: rawSource._id || rawSource.id,
      };
      
      set(state => ({ 
        sources: [newSource, ...state.sources],
        selectedSource: newSource
      }));
      
      toast.success("URL source queued for processing");
      
      // Start polling for completion
      get().pollSourceStatus(newSource._id);
      
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

  pollSourceStatus: async (sourceId) => {
    const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes timeout
    const INITIAL_INTERVAL_MS = 1000;             // Start at 1s
    const MAX_INTERVAL_MS = 10000;                // Cap at 10s
    const BACKOFF_MULTIPLIER = 1.5;

    const startTime = Date.now();
    let interval = INITIAL_INTERVAL_MS;

    const poll = async () => {
      // Timeout check
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        toast.error("Processing is taking too long. Please refresh later.");
        return;
      }

      try {
        const response = await axiosInstance.get(`/source/${sourceId}/status`);
        const { source } = response.data;

        if (source.status === 'completed') {
          // Update the source in state with full data (title, summary)
          // Refetch to get the full source object
          const fullRes = await axiosInstance.get('/source');
          const allSources = (fullRes.data?.sources || []).map(s => ({ ...s, _id: s._id || s.id })).reverse();
          const completedSource = allSources.find(s => s._id === sourceId);

          set(state => {
            const currentSelectedId = state.selectedSource?._id || state.selectedSource?.id;
            return {
              sources: allSources,
              selectedSource:
                currentSelectedId === sourceId
                  ? completedSource || state.selectedSource
                  : state.selectedSource,
            };
          });
          toast.success("Source processed successfully!");
          return; // Stop polling
        }

        if (source.status === 'failed') {
          set(state => ({
            sources: state.sources.map(s =>
              (s._id === sourceId || s.id === sourceId)
                ? { ...s, status: 'failed', errorMessage: source.errorMessage }
                : s
            ),
            selectedSource:
              (state.selectedSource?._id === sourceId || state.selectedSource?.id === sourceId)
                ? { ...state.selectedSource, status: 'failed', errorMessage: source.errorMessage }
                : state.selectedSource,
          }));
          toast.error(`Processing failed: ${source.errorMessage || 'Unknown error'}`);
          return; // Stop polling
        }

        // Still processing — update status locally and schedule next poll
        set(state => ({
          sources: state.sources.map(s =>
            (s._id === sourceId || s.id === sourceId)
              ? { ...s, status: source.status }
              : s
          ),
        }));

        interval = Math.min(interval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
        setTimeout(poll, interval);
      } catch (error) {
        console.error('Polling error:', error);
        // Don't stop polling on network errors, just retry
        setTimeout(poll, interval);
      }
    };

    // Start first poll
    setTimeout(poll, INITIAL_INTERVAL_MS);
  },

  getViewUrl: async (sourceId) => {
    try {
      const response = await axiosInstance.get(`/source/${sourceId}/view-url`);
      return response.data.viewUrl;
    } catch (error) {
      console.error("Get view URL error:", error);
      const message = error.response?.data?.message || "Failed to get file URL";
      toast.error(message);
      return null;
    }
  },

  selectSource: (source) => {
    const normalized = source ? { ...source, _id: source._id || source.id } : null;
    set({ selectedSource: normalized });
  },

  clearSources: () => {
    set({ sources: [], selectedSource: null });
  }

}));