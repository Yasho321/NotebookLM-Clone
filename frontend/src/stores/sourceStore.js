import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import axios from 'axios';
import { toast } from 'sonner';
import { useChatStore } from './chatStore';

// One shared poller for ALL in-progress sources (instead of one setTimeout loop per
// source that each refetched the whole list). `active` guards against starting two
// loops; `interval` adapts: fast while things are changing, backing off when quiet.
const IN_PROGRESS = ['uploading', 'queued', 'processing'];
const pollState = { timer: null, active: false, interval: 1000 };

const PAGE_SIZE = 6;
const normalize = (arr) => (arr || []).map((s) => ({ ...s, _id: s._id || s.id }));

export const useSourceStore = create((set, get) => ({
  sources: [],
  selectedSource: null,
  selectedSourceIds: [],
  isLoading: false,
  isUploading: false,
  // Pagination (cursor-based). `expanded` controls the Show more / Show less UI.
  nextCursor: null,
  hasMore: false,
  isLoadingMore: false,
  expanded: false,

  fetchSources: async () => {
    try {
      set({ isLoading: true });
      // First page only — newest first (backend already sorts createdAt desc; no reverse).
      const response = await axiosInstance.get('/source', { params: { limit: PAGE_SIZE } });
      const sources = normalize(response.data?.sources);
      const { nextCursor = null, hasMore = false } = response.data || {};

      set((state) => {
        const currentSelectedId = state.selectedSource?._id;
        const validIds = new Set(sources.map((s) => s._id));

        const activeChat = useChatStore.getState?.()?.activeChat;
        const activeChatId = useChatStore.getState?.()?.activeChatId;

        let newSelectedIds;
        if (activeChatId && activeChat?.sourceIds) {
          // Locked to the active chat — keep ALL its sources even if some aren't on page 1.
          newSelectedIds = activeChat.sourceIds.map((s) => (typeof s === 'string' ? s : s._id || s.id));
        } else {
          newSelectedIds = state.selectedSourceIds.filter((id) => validIds.has(id));
          if (newSelectedIds.length === 0 && sources.length > 0) {
            const completed = sources.filter((s) => s.status === 'completed');
            newSelectedIds = (completed.length > 0 ? completed : sources).map((s) => s._id);
          }
        }

        return {
          sources,
          nextCursor,
          hasMore,
          expanded: false,
          selectedSourceIds: newSelectedIds,
          selectedSource:
            currentSelectedId && sources.find((s) => s._id === currentSelectedId)
              ? sources.find((s) => s._id === currentSelectedId)
              : state.selectedSource || sources[0] || null,
        };
      });

      if (sources.some((s) => IN_PROGRESS.includes(s.status))) {
        get().startStatusPolling();
      }
    } catch (error) {
      console.error('Fetch sources error:', error);
      const message = error.response?.data?.message || 'Failed to fetch sources';
      toast.error(message);
    } finally {
      set({ isLoading: false });
    }
  },

  // Load the next page (for infinite scroll / "Show more"). Appends, de-duplicating by id.
  loadMoreSources: async () => {
    const { nextCursor, hasMore, isLoadingMore } = get();
    if (!hasMore || isLoadingMore || !nextCursor) return;
    try {
      set({ isLoadingMore: true });
      const response = await axiosInstance.get('/source', {
        params: { limit: PAGE_SIZE, cursor: nextCursor },
      });
      const more = normalize(response.data?.sources);
      set((state) => {
        const existing = new Set(state.sources.map((s) => s._id));
        const appended = more.filter((s) => !existing.has(s._id));
        return {
          sources: [...state.sources, ...appended],
          nextCursor: response.data?.nextCursor ?? null,
          hasMore: response.data?.hasMore ?? false,
        };
      });
    } catch (error) {
      console.error('Load more sources error:', error);
    } finally {
      set({ isLoadingMore: false });
    }
  },

  setExpanded: (expanded) => set({ expanded }),

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

  // Kept for backward compatibility — callers that targeted one source now just ensure
  // the single shared poller is running.
  pollSourceStatus: () => get().startStatusPolling(),

  stopStatusPolling: () => {
    if (pollState.timer) clearTimeout(pollState.timer);
    pollState.timer = null;
    pollState.active = false;
  },

  /**
   * Start (or keep running) ONE poller that watches every in-progress source.
   *
   * Design choices that make it feel polished:
   *  - A single GET /source per tick instead of one request per source + a full refetch
   *    on every completion.
   *  - Adaptive cadence: a quick first check (400ms), then stay fast (~900ms) while
   *    statuses are actively changing, and gently back off (×1.3, cap 4s) when quiet —
   *    so progress feels instant without hammering the server once things settle.
   *  - Toasts only fire on real status TRANSITIONS, not on every tick.
   *  - Optimistic 'uploading' sources (not yet returned by the API) are preserved so
   *    they don't flicker out of the list mid-upload.
   */
  startStatusPolling: () => {
    if (pollState.active) return; // already running
    pollState.active = true;
    pollState.interval = 900;

    const FIRST_DELAY = 400;
    const MIN_INTERVAL = 900;
    const MAX_INTERVAL = 4000;

    const tick = async () => {
      pollState.timer = null;
      if (!pollState.active) return;

      let anyInProgress = false;
      let changed = false;

      try {
        // Fetch the newest page (enough to cover any in-progress + newly-added sources,
        // which are always the most recent). We MERGE statuses into the existing list so
        // additional pages loaded via "Show more" are never truncated.
        const res = await axiosInstance.get('/source', { params: { limit: 20 } });
        const fresh = normalize(res.data?.sources);
        const freshById = new Map(fresh.map((s) => [s._id, s]));
        const prevById = new Map(get().sources.map((s) => [s._id, s]));

        for (const f of fresh) {
          const prev = prevById.get(f._id);
          if (!prev || prev.status !== f.status) {
            changed = true;
            if (f.status === 'completed') {
              toast.success(`"${f.title || f.originalFileName || 'Source'}" is ready`);
            } else if (f.status === 'failed') {
              toast.error(`Processing failed: ${f.errorMessage || 'Unknown error'}`);
            }
          }
          if (IN_PROGRESS.includes(f.status)) anyInProgress = true;
        }

        set((state) => {
          // Patch existing sources with fresh fields (status/title/summary/errorMessage…).
          let merged = state.sources.map((s) =>
            freshById.has(s._id) ? { ...s, ...freshById.get(s._id) } : s
          );
          // Prepend only GENUINELY new sources (created after our newest loaded one) — NOT
          // older items that simply belong to a not-yet-loaded page, which would corrupt
          // pagination. New uploads are always the most recent.
          const existingIds = new Set(state.sources.map((s) => s._id));
          const newestLoaded = state.sources.reduce(
            (max, s) => Math.max(max, new Date(s.createdAt || 0).getTime()),
            0
          );
          const brandNew = fresh.filter(
            (f) => !existingIds.has(f._id) && new Date(f.createdAt || 0).getTime() > newestLoaded
          );
          if (brandNew.length) merged = [...brandNew, ...merged];
          if (state.sources.some((s) => s.status === 'uploading')) anyInProgress = true;

          const selId = state.selectedSource?._id;
          const selMatch = merged.find((s) => s._id === selId);
          return { sources: merged, selectedSource: selMatch || state.selectedSource };
        });
      } catch (error) {
        console.error('Polling error:', error);
        anyInProgress = true; // keep trying on transient network errors
      }

      if (anyInProgress && pollState.active) {
        pollState.interval = changed
          ? MIN_INTERVAL
          : Math.min(pollState.interval * 1.3, MAX_INTERVAL);
        pollState.timer = setTimeout(tick, pollState.interval);
      } else {
        pollState.active = false;
        pollState.timer = null;
        pollState.interval = MIN_INTERVAL;
      }
    };

    pollState.timer = setTimeout(tick, FIRST_DELAY);
  },

  /**
   * Delete a source. The server runs the cascade (vectors/chunks/S3/chat-membership) in a
   * background job. Allowed at any time — even while a chat is active/locked. Optimistic
   * with rollback. Also reflects chat read-only state locally for instant feedback.
   */
  deleteSource: async (sourceId) => {
    if (!sourceId) return { success: false };

    const prev = get().sources;
    const prevSelected = get().selectedSource;

    set((state) => {
      const remaining = state.sources.filter((s) => s._id !== sourceId);
      const wasSelected = state.selectedSource?._id === sourceId;
      return {
        sources: remaining,
        selectedSourceIds: state.selectedSourceIds.filter((id) => id !== sourceId),
        selectedSource: wasSelected ? remaining[0] || null : state.selectedSource,
      };
    });

    try {
      await axiosInstance.delete(`/source/${sourceId}`);
      toast.success('Source deletion started');
      // Mirror the server-side chat cascade locally: drop this source from chats and, if a
      // chat is left with none, mark it read-only so the UI reacts without waiting on a poll.
      useChatStore.getState?.()?.applySourceDeletion?.(sourceId);
      return { success: true };
    } catch (error) {
      set({ sources: prev, selectedSource: prevSelected });
      toast.error(error.response?.data?.message || 'Failed to delete source');
      return { success: false };
    }
  },

  /**
   * Rename a source's display title. Optimistic with rollback.
   */
  renameSource: async (sourceId, title) => {
    const trimmed = (title || '').trim();
    if (!sourceId || !trimmed) return { success: false };

    const prev = get().sources;
    const prevSelected = get().selectedSource;

    set((state) => ({
      sources: state.sources.map((s) => (s._id === sourceId ? { ...s, title: trimmed } : s)),
      selectedSource:
        state.selectedSource?._id === sourceId
          ? { ...state.selectedSource, title: trimmed }
          : state.selectedSource,
    }));

    try {
      await axiosInstance.patch(`/source/${sourceId}`, { title: trimmed });
      toast.success('Source renamed');
      return { success: true };
    } catch (error) {
      set({ sources: prev, selectedSource: prevSelected });
      toast.error(error.response?.data?.message || 'Failed to rename source');
      return { success: false };
    }
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

  // Signal consumed by ContentPanel to open a source in the Document viewer at a page.
  // `ts` forces a change even when the same source/page is clicked twice.
  citationJump: null,
  jumpToCitation: (source, page) => {
    const normalized = source ? { ...source, _id: source._id || source.id } : null;
    if (!normalized) return;
    set({
      selectedSource: normalized,
      citationJump: { sourceId: normalized._id, page: page || 1, ts: Date.now() },
    });
  },

  toggleSourceSelection: (sourceId) => {
    const activeChatId = useChatStore.getState?.()?.activeChatId;
    if (activeChatId) {
      toast.info("Sources cannot be changed in an existing dialogue. Start a new dialogue to select different sources.");
      return;
    }
    set((state) => {
      const exists = state.selectedSourceIds.includes(sourceId);
      const newSelected = exists
        ? state.selectedSourceIds.filter((id) => id !== sourceId)
        : [...state.selectedSourceIds, sourceId];
      return { selectedSourceIds: newSelected };
    });
  },

  selectAllSources: () => {
    const activeChatId = useChatStore.getState?.()?.activeChatId;
    if (activeChatId) return;
    set((state) => ({
      selectedSourceIds: state.sources.map((s) => s._id),
    }));
  },

  clearSourceSelection: () => {
    const activeChatId = useChatStore.getState?.()?.activeChatId;
    if (activeChatId) return;
    set({ selectedSourceIds: [] });
  },

  clearSources: () => {
    get().stopStatusPolling();
    set({ sources: [], selectedSource: null, selectedSourceIds: [] });
  }

}));