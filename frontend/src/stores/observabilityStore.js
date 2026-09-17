import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { toast } from 'sonner';

export const useObservabilityStore = create((set, get) => ({
  metrics: null,
  traces: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  selectedTrace: null,
  filters: { strategy: '', hasError: '', chatId: '', page: 1 },

  isLoadingMetrics: false,
  isLoadingTraces: false,
  isLoadingTraceDetails: false,

  ablationRuns: [],
  isRunningAblation: false,
  latestAblationReport: null,

  goldenDatasets: [],
  isLoadingGoldens: false,
  isRunningGoldenEval: false,

  aiJudgeResults: {},
  isJudging: false,

  /**
   * Fetch aggregated KPIs and metrics
   */
  fetchMetrics: async () => {
    try {
      set({ isLoadingMetrics: true });
      const res = await axiosInstance.get('/observability/metrics');
      if (res.data?.success) {
        set({ metrics: res.data.metrics });
      }
    } catch (err) {
      console.error('Fetch metrics error:', err);
      // Suppress toast if forbidden (non-admin)
      if (err.response?.status !== 403) {
        toast.error('Failed to load observability metrics');
      }
    } finally {
      set({ isLoadingMetrics: false });
    }
  },

  /**
   * Fetch paginated traces with optional filters
   */
  fetchTraces: async (newFilters = {}) => {
    const mergedFilters = { ...get().filters, ...newFilters };
    set({ filters: mergedFilters, isLoadingTraces: true });

    try {
      const params = new URLSearchParams();
      if (mergedFilters.page) params.append('page', mergedFilters.page);
      if (mergedFilters.strategy) params.append('strategy', mergedFilters.strategy);
      if (mergedFilters.hasError) params.append('hasError', mergedFilters.hasError);
      if (mergedFilters.chatId) params.append('chatId', mergedFilters.chatId);

      const res = await axiosInstance.get(`/observability/traces?${params.toString()}`);
      if (res.data?.success) {
        set({
          traces: res.data.traces || [],
          pagination: res.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
        });
      }
    } catch (err) {
      console.error('Fetch traces error:', err);
      if (err.response?.status !== 403) {
        toast.error('Failed to load traces');
      }
    } finally {
      set({ isLoadingTraces: false });
    }
  },

  /**
   * Close the selected trace drawer
   */
  closeTraceDetails: () => {
    set({ selectedTrace: null, isLoadingTraceDetails: false });
  },

  /**
   * Fetch detailed execution trace with full event log
   */
  fetchTraceDetails: async (traceId) => {
    if (!traceId) {
      set({ selectedTrace: null });
      return;
    }
    try {
      set({ isLoadingTraceDetails: true, selectedTrace: null });
      const res = await axiosInstance.get(`/observability/traces/${traceId}`);
      if (res.data?.success) {
        set({ selectedTrace: res.data.trace });
      }
    } catch (err) {
      console.error('Fetch trace details error:', err);
      toast.error('Failed to fetch trace details');
    } finally {
      set({ isLoadingTraceDetails: false });
    }
  },

  /**
   * Run LLM-as-a-Judge RAG Triad evaluation on a trace
   */
  runAIJudge: async (traceId) => {
    if (!traceId) return null;
    try {
      set({ isJudging: true });
      const res = await axiosInstance.post(`/observability/evals/judge/${traceId}`);
      if (res.data?.success) {
        const evaluation = res.data.evaluation;
        set((state) => ({
          aiJudgeResults: { ...state.aiJudgeResults, [traceId]: evaluation },
          selectedTrace: state.selectedTrace?.traceId === traceId
            ? { ...state.selectedTrace, aiJudge: evaluation }
            : state.selectedTrace,
          traces: state.traces.map((t) =>
            t.traceId === traceId ? { ...t, aiJudge: evaluation } : t
          ),
        }));
        toast.success('AI Judge evaluation complete');
        return evaluation;
      }
      return null;
    } catch (err) {
      console.error('AI Judge error:', err);
      toast.error(err.response?.data?.message || 'Failed to run AI Judge');
      return null;
    } finally {
      set({ isJudging: false });
    }
  },

  /**
   * Trigger an ablation test suite
   */
  runAblation: async (testQueries, sourceIds = [], name = '') => {
    try {
      set({ isRunningAblation: true, latestAblationReport: null });
      const res = await axiosInstance.post('/observability/evals/ablation', {
        testQueries,
        sourceIds,
        name: name || `Ablation Benchmark - ${new Date().toLocaleDateString()}`,
      });
      if (res.data?.success) {
        const report = res.data.report;
        set({ latestAblationReport: report });
        get().fetchAblationRuns();
        toast.success('Ablation benchmark finished successfully');
        return report;
      }
      return null;
    } catch (err) {
      console.error('Ablation test error:', err);
      toast.error(err.response?.data?.message || 'Ablation benchmark failed');
      return null;
    } finally {
      set({ isRunningAblation: false });
    }
  },

  /**
   * List historical ablation runs
   */
  fetchAblationRuns: async () => {
    try {
      const res = await axiosInstance.get('/observability/evals/ablation');
      if (res.data?.success) {
        set({ ablationRuns: res.data.runs || [] });
      }
    } catch (err) {
      console.error('Fetch ablation runs error:', err);
    }
  },

  /**
   * List golden datasets
   */
  fetchGoldens: async () => {
    try {
      set({ isLoadingGoldens: true });
      const res = await axiosInstance.get('/observability/evals/goldens');
      if (res.data?.success) {
        set({ goldenDatasets: res.data.datasets || [] });
      }
    } catch (err) {
      console.error('Fetch goldens error:', err);
    } finally {
      set({ isLoadingGoldens: false });
    }
  },

  /**
   * Generate synthetic goldens
   */
  generateGoldens: async (sourceId, count = 5) => {
    try {
      const res = await axiosInstance.post('/observability/evals/goldens/generate', {
        sourceId,
        count,
      });
      if (res.data?.success) {
        toast.success('Golden evaluation dataset generated');
        get().fetchGoldens();
        return res.data.dataset;
      }
      return null;
    } catch (err) {
      console.error('Generate goldens error:', err);
      toast.error(err.response?.data?.message || 'Failed to generate goldens');
      return null;
    }
  },

  /**
   * Run benchmark on golden dataset
   */
  runGoldenEval: async (datasetId) => {
    try {
      set({ isRunningGoldenEval: true });
      const res = await axiosInstance.post(`/observability/evals/goldens/${datasetId}/run`);
      if (res.data?.success) {
        toast.success('Golden evaluation benchmark complete');
        get().fetchGoldens();
        return res.data.evaluationRun;
      }
      return null;
    } catch (err) {
      console.error('Run golden eval error:', err);
      toast.error(err.response?.data?.message || 'Golden evaluation failed');
      return null;
    } finally {
      set({ isRunningGoldenEval: false });
    }
  },
}));
