import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useObservabilityStore } from '../stores/observabilityStore';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  Activity,
  Scale,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const ADMIN_EMAIL = 'yashovardhans321@chithilm.com';

export default function Dashboard() {
  const navigate = useNavigate();
  const { authUser } = useAuthStore();
  const {
    metrics,
    traces,
    pagination,
    selectedTrace,
    filters,
    isLoadingMetrics,
    isLoadingTraces,
    isJudging,
    fetchMetrics,
    fetchTraces,
    fetchTraceDetails,
    closeTraceDetails,
    runAIJudge,
  } = useObservabilityStore();

  const isAdmin =
    authUser?.role === 'admin' ||
    authUser?.email?.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Fetch initial telemetry data
  useEffect(() => {
    if (isAdmin) {
      fetchMetrics();
      fetchTraces();
    }
  }, [isAdmin, fetchMetrics, fetchTraces]);

  // Handle Escape key to close the drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeTraceDetails();
      }
    };
    if (selectedTrace) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedTrace, closeTraceDetails]);

  // If user is not admin, show access restricted view
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 border border-border rounded-xl bg-card shadow-xs">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Admin Access Required
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The Observability & Evaluation telemetry cockpit is restricted exclusively to authorized system administrators ({ADMIN_EMAIL}).
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/workspace')}
            className="w-full text-xs font-medium cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Return to Workspace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Cockpit Header */}
      <header className="h-14 border-b border-border px-6 flex items-center justify-between flex-shrink-0 bg-background/95 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workspace')}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
            title="Return to Workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div 
            onClick={() => navigate('/workspace')} 
            className="flex items-center gap-2 cursor-pointer group select-none"
            title="Return to Chithhi LM Workspace"
          >
            <img
              src="/logo.png"
              alt="Chithhi LM Logo"
              className="w-6 h-6 object-contain drop-shadow-xs dark:drop-shadow-[0_2px_6px_rgba(255,255,255,0.15)] group-hover:scale-105 transition-transform duration-200"
            />
            <span className="text-xs font-semibold text-foreground tracking-tight group-hover:text-foreground/80 transition-colors">
              Chithhi LM
            </span>
          </div>
          <div className="h-4 w-px bg-border mx-0.5" />
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <h1 className="text-xs font-medium text-muted-foreground tracking-tight hidden sm:inline">
              Observability & Evaluation Cockpit
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
              Telemetry
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchMetrics();
              fetchTraces();
              toast.success('Telemetry data refreshed');
            }}
            disabled={isLoadingMetrics || isLoadingTraces}
            className="h-8 text-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${
                isLoadingMetrics || isLoadingTraces ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 overflow-y-auto">
        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Total Agent Runs
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.totalRuns ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              Sample: {metrics?.sampleSize || 0} traces
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Avg Total Latency
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.avgDurationMs ? `${metrics.avgDurationMs}ms` : '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              Ret: {metrics?.avgRetrievalMs || 0}ms · Gen: {metrics?.avgGenerationMs || 0}ms
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Context Grade
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.avgGradeScore ? `${metrics.avgGradeScore} / 10` : '—'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              Corrective RAG target ≥ 6.0
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Refusal Rate
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.refusalRate || '0%'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              Low confidence (&lt;3) fallbacks
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Corrective Retry Rate
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.retryRate || '0%'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              CRAG loop auto-corrections
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Error Rate
            </span>
            <p className="text-xl font-mono font-semibold text-foreground">
              {metrics?.errorRate || '0%'}
            </p>
            <span className="text-[10px] text-muted-foreground">
              Stream or pipeline faults
            </span>
          </div>
        </div>

        {/* Strategy & Channel Usage Distribution */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Strategy Distribution */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Adaptive Strategy Routing Distribution
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Classifier Breakdowns
                </span>
              </div>
              <div className="space-y-1.5 pt-1">
                {Object.entries(metrics.strategyDistribution || {}).map(([strat, count]) => {
                  const pct = Math.round((count / (metrics.sampleSize || 1)) * 100);
                  return (
                    <div key={strat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground text-[11px]">{strat}</span>
                        <span className="font-mono font-medium text-foreground text-[11px]">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Channels Searched */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Retrieval Channel Invocations
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Hybrid Blends
                </span>
              </div>
              <div className="space-y-1.5 pt-1">
                {Object.entries(metrics.channelUsage || {}).map(([chan, count]) => {
                  const maxCount = Math.max(...Object.values(metrics.channelUsage || {}), 1);
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={chan} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground text-[11px]">
                          {chan === 'VECTOR'
                            ? 'Dense Vector (Qdrant)'
                            : chan === 'BM25'
                            ? 'Sparse Keyword (BM25)'
                            : 'HyDE Vector Search'}
                        </span>
                        <span className="font-mono font-medium text-foreground text-[11px]">
                          {count} queries
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* EXECUTION TRACES EXPLORER */}
        <div className="space-y-4 pt-2">
          {/* Section Header & Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
                Execution Traces ({traces.length})
              </h2>

              <select
                value={filters.strategy || ''}
                onChange={(e) => fetchTraces({ strategy: e.target.value, page: 1 })}
                className="h-8 px-2.5 rounded-md text-xs bg-background border border-border text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Strategies</option>
                <option value="FACTUAL_SPECIFIC">FACTUAL_SPECIFIC</option>
                <option value="BROAD_SUMMARY">BROAD_SUMMARY</option>
                <option value="DIRECT_ANSWER">DIRECT_ANSWER</option>
                <option value="COMPLEX_DECOMPOSE">COMPLEX_DECOMPOSE</option>
              </select>

              <select
                value={filters.hasError || ''}
                onChange={(e) => fetchTraces({ hasError: e.target.value, page: 1 })}
                className="h-8 px-2.5 rounded-md text-xs bg-background border border-border text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="false">Healthy (No Error)</option>
                <option value="true">Errors Only</option>
              </select>
            </div>

            <span className="text-xs text-muted-foreground">
              Showing {traces.length} of {pagination.total} traces
            </span>
          </div>

          {/* Traces Table */}
          <div className="border border-border rounded-lg overflow-hidden bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border font-medium">
                  <tr>
                    <th className="py-2.5 px-4 font-mono">Trace ID</th>
                    <th className="py-2.5 px-4">User Query</th>
                    <th className="py-2.5 px-4">Strategy</th>
                    <th className="py-2.5 px-4 font-mono">Duration</th>
                    <th className="py-2.5 px-4 font-mono">Grade</th>
                    <th className="py-2.5 px-4 font-mono">Retries</th>
                    <th className="py-2.5 px-4">AI Judge</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {traces.map((trace) => {
                    const rm = trace.retrievalMetrics || {};
                    const hasJudge = Boolean(trace.aiJudge);

                    return (
                      <tr
                        key={trace.traceId}
                        onClick={() => fetchTraceDetails(trace.traceId)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono text-muted-foreground text-[11px] truncate max-w-[120px]">
                          {trace.traceId}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-foreground max-w-[280px] truncate">
                          {trace.query}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                            {rm.strategy || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {trace.duration ? `${trace.duration}ms` : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {typeof rm.contextGradeScore === 'number' ? (
                            <span
                              className={
                                rm.contextGradeScore >= 6
                                  ? 'text-green-600 font-semibold'
                                  : 'text-amber-600'
                              }
                            >
                              {rm.contextGradeScore}/10
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {rm.correctiveRetries || 0}
                        </td>
                        <td className="py-2.5 px-4">
                          {hasJudge ? (
                            <span className="text-[10px] font-semibold text-green-600 bg-green-600/10 px-1.5 py-0.5 rounded border border-green-600/20">
                              Triad: {trace.aiJudge.faithfulness ?? trace.aiJudge.groundedness}/10
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              Not evaluated
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchTraceDetails(trace.traceId);
                            }}
                            className="text-xs text-primary hover:underline font-medium cursor-pointer"
                          >
                            Inspect →
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {traces.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No telemetry traces found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Slide-Over Drawer for Selected Trace Details */}
      {selectedTrace && (
        <>
          {/* Backdrop Overlay to close on click outside */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-40 animate-fade-in"
            onClick={closeTraceDetails}
          />

          <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-fade-in-up">
            {/* Drawer Header */}
            <div className="h-14 border-b border-border px-5 flex items-center justify-between flex-shrink-0 bg-background">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground font-mono">
                  {selectedTrace.traceId}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {selectedTrace.duration}ms
                </span>
              </div>
              <button
                type="button"
                onClick={closeTraceDetails}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors cursor-pointer"
                title="Close drawer (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              {/* User Query */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  User Query
                </span>
                <div className="p-3 bg-muted/40 rounded-lg border border-border font-medium text-foreground">
                  {selectedTrace.query}
                </div>
              </div>

              {/* Latency Waterfall */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Latency Breakdown Waterfall
                </span>
                <div className="p-3 border border-border rounded-lg bg-card space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Episodic Memory Fetch:</span>
                    <span>{selectedTrace.stepDurations?.memoryMs || 0}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Modular Retrieval Pipeline:</span>
                    <span>{selectedTrace.stepDurations?.retrievalMs || 0}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">LLM Agent Token Generation:</span>
                    <span>{selectedTrace.stepDurations?.generationMs || 0}ms</span>
                  </div>
                  <div className="border-t border-border/60 pt-1.5 flex items-center justify-between font-semibold">
                    <span>Total End-to-End:</span>
                    <span>{selectedTrace.duration}ms</span>
                  </div>
                </div>
              </div>

              {/* Retrieval Funnel Metrics */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Retrieval Funnel & Context Grade
                </span>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2.5 border border-border rounded-md bg-card">
                    <span className="text-muted-foreground block text-[10px]">Candidates:</span>
                    <span className="font-semibold text-foreground">
                      {selectedTrace.retrievalMetrics?.candidateCount || 0} chunks
                    </span>
                  </div>
                  <div className="p-2.5 border border-border rounded-md bg-card">
                    <span className="text-muted-foreground block text-[10px]">After Floor:</span>
                    <span className="font-semibold text-foreground">
                      {selectedTrace.retrievalMetrics?.afterFloorCount || 0} chunks
                    </span>
                  </div>
                  <div className="p-2.5 border border-border rounded-md bg-card">
                    <span className="text-muted-foreground block text-[10px]">Reranked Top-K:</span>
                    <span className="font-semibold text-foreground">
                      {selectedTrace.retrievalMetrics?.afterRerankCount || 0} chunks
                    </span>
                  </div>
                  <div className="p-2.5 border border-border rounded-md bg-card">
                    <span className="text-muted-foreground block text-[10px]">Context Grade:</span>
                    <span className="font-semibold text-green-600">
                      {selectedTrace.retrievalMetrics?.contextGradeScore ?? '—'}/10
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Judge (LLM-as-a-Judge) RAG Triad Section */}
              <div className="space-y-2 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    AI Judge: RAG Triad Evaluation
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runAIJudge(selectedTrace.traceId)}
                    disabled={isJudging}
                    className="h-7 text-xs cursor-pointer"
                  >
                    <Scale className={`w-3 h-3 mr-1 ${isJudging ? 'animate-spin' : ''}`} />
                    {isJudging ? 'Evaluating...' : 'Run AI Judge'}
                  </Button>
                </div>

                {selectedTrace.aiJudge ? (
                  <div className="p-3.5 rounded-lg border border-border bg-card space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Context Relevance:</span>
                      <span className="font-semibold text-foreground">
                        {selectedTrace.aiJudge.contextRelevance}/10
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Faithfulness / Groundedness:</span>
                      <span className="font-semibold text-foreground">
                        {selectedTrace.aiJudge.faithfulness ?? selectedTrace.aiJudge.groundedness}/10
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Answer Relevance:</span>
                      <span className="font-semibold text-foreground">
                        {selectedTrace.aiJudge.answerRelevance}/10
                      </span>
                    </div>
                    {selectedTrace.aiJudge.reasoning && (
                      <div className="pt-2 border-t border-border/60 text-muted-foreground font-sans text-xs">
                        <p className="font-medium text-foreground mb-0.5">Judge Rationale:</p>
                        {selectedTrace.aiJudge.reasoning}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">
                    Not yet evaluated by AI Judge. Click above to compute Context Relevance, Faithfulness, and Answer Relevance.
                  </p>
                )}
              </div>

              {/* Generated Response */}
              <div className="space-y-2 border-t border-border/60 pt-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Agent Final Response
                </span>
                <div className="p-3.5 bg-muted/20 rounded-lg border border-border leading-relaxed text-foreground max-h-60 overflow-y-auto">
                  {selectedTrace.response || 'No response recorded.'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
