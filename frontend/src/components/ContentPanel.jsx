import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Link,
  Calendar,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  FileType,
  FileSpreadsheet,
  Upload,
  Quote,
  Network,
  X,
  HelpCircle,
} from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';

const SkeletonLine = ({ width = '100%', height = '12px' }) => (
  <div className="skeleton" style={{ width, height, marginBottom: '8px' }} />
);

const COMING_SOON_DATA = {
  'timeline': {
    category: 'CHRONOLOGICAL SYNTHESIS',
    title: 'Event Timeline & Temporal Extraction',
    description: 'Automatically extract key milestones, historical chronology, and temporal sequences embedded within your ingested sources into an interactive timeline.',
    icon: Calendar,
    stage: 'In Development',
    eta: 'Q2 2026',
  },
  'citations': {
    category: 'SOURCE ATTRIBUTION',
    title: 'Granular Citation & Footnote Mapping',
    description: 'Deep document attribution linking syntheses, claims, and dialogue responses directly to verifiable page numbers, verbatim excerpts, and primary paragraphs.',
    icon: Quote,
    stage: 'In Development',
    eta: 'Q2 2026',
  },
  'graph-view': {
    category: 'KNOWLEDGE TOPOLOGY',
    title: 'Semantic Entity & Concept Network',
    description: 'Explore the conceptual architecture of your research corpus. Visualize cross-document connections, entity relationships, and knowledge clusters.',
    icon: Network,
    stage: 'In Development',
    eta: 'Q3 2026',
  },
};

export default function ContentPanel() {
  const { selectedSource, getViewUrl } = useSourceStore();
  const [isLoadingViewUrl, setIsLoadingViewUrl] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [showTutorial, setShowTutorial] = useState(false);

  const tabs = ['SUMMARY', 'TIMELINE', 'CITATIONS', 'GRAPH VIEW'];

  const getSourceIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'docx': return <FileType className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'csv': return <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'link': return <Link className="w-4 h-4 text-muted-foreground" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleViewFile = async () => {
    const sourceId = selectedSource?._id || selectedSource?.id;
    if (!sourceId) return;
    setIsLoadingViewUrl(true);
    const url = await getViewUrl(sourceId);
    setIsLoadingViewUrl(false);
    if (url) window.open(url, '_blank');
  };

  const isFileType = selectedSource && ['pdf', 'docx', 'csv', 'text'].includes(selectedSource.type);

  const getStatusMessage = (status) => {
    switch (status) {
      case 'uploading': return 'Uploading to cloud...';
      case 'queued': return 'Waiting in queue...';
      case 'processing': return 'Analyzing content...';
      default: return 'Processing source...';
    }
  };

  // Render Coming Soon screen for non-summary tabs
  const renderComingSoon = (tabKey) => {
    const data = COMING_SOON_DATA[tabKey] || {
      category: 'SYNTHESIS MODULE',
      title: 'Module Under Construction',
      description: 'This synthesis feature is currently being developed for editorial research workflows.',
      icon: Sparkles,
      stage: 'In Development',
      eta: 'Coming Soon',
    };
    const Icon = data.icon;

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in-up">
        <div className="max-w-md mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-border bg-muted/40 mb-8" style={{ borderRadius: '2px' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }}></span>
            <span className="text-label" style={{ color: 'var(--accent)', fontSize: '10px', letterSpacing: '0.1em' }}>
              {data.stage.toUpperCase()} · {data.eta}
            </span>
          </div>

          <div className="w-14 h-14 border border-border flex items-center justify-center mb-6 bg-card" style={{ borderRadius: '2px' }}>
            <Icon className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>

          <p className="text-label text-muted-foreground mb-3" style={{ fontSize: '11px', letterSpacing: '0.12em' }}>
            {data.category}
          </p>

          <h2 className="text-foreground text-display mb-4 tracking-tight">
            {data.title}
          </h2>

          <p className="text-body text-muted-foreground leading-relaxed mb-8">
            {data.description}
          </p>

          <Button
            variant="outline"
            onClick={() => setActiveTab('summary')}
            className="text-sm font-medium px-6 py-2.5 hover:bg-muted shadow-xs"
          >
            Return to Summary
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Content Area */}
      {activeTab !== 'summary' ? (
        renderComingSoon(activeTab)
      ) : !selectedSource ? (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md animate-fade-in-up">
            <p className="text-label mb-4" style={{ color: 'var(--accent)', fontSize: '11px' }}>
              INTELLECT SYNTHESIS
            </p>
            <h2 className="text-foreground mb-6" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '-0.03em', lineHeight: '1.1' }}>
              BEGIN THE<br />DIALOGUE.
            </h2>
            <p className="text-body text-muted-foreground mb-8 leading-relaxed">
              The synthesis engine requires a foundation. Ingest a document, research paper, or URL via the sidebar to initiate the extraction of editorial insights.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => setShowTutorial(true)}
                className="text-sm font-medium shadow-xs"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                View Tutorial
              </Button>
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="text-sm font-medium shadow-xs"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload File
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Selected Source Summary State */
        <div className="flex-1 overflow-y-auto px-8 py-8 md:px-12">
          <div className="max-w-2xl mx-auto">
            {/* Source header info */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                {getSourceIcon(selectedSource.type)}
                <span className="text-label text-muted-foreground" style={{ fontSize: '11px' }}>
                  {selectedSource.type?.toUpperCase()} · {formatDate(selectedSource.createdAt)}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ml-1 ${
                  selectedSource.status === 'completed' ? 'bg-green-500' :
                  selectedSource.status === 'failed' ? 'bg-destructive' :
                  'animate-pulse'
                }`} style={selectedSource.status !== 'completed' && selectedSource.status !== 'failed' ? { background: 'var(--accent)' } : {}} />
              </div>
              <h1 className="text-foreground leading-tight mb-4" style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '-0.02em', lineHeight: '1.15' }}>
                {selectedSource.title || selectedSource.originalFileName || `${selectedSource.type} Source`}
              </h1>

              {/* URL display */}
              {(selectedSource.rawURL || selectedSource.webURL) && (
                <a
                  href={selectedSource.rawURL || selectedSource.webURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-meta text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {selectedSource.rawURL || selectedSource.webURL}
                </a>
              )}

              {/* View file button */}
              {isFileType && selectedSource.status === 'completed' && selectedSource.s3Key && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewFile}
                    disabled={isLoadingViewUrl}
                    className="text-xs font-medium border-border hover:bg-muted shadow-xs"
                  >
                    {isLoadingViewUrl ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    View Original
                  </Button>
                </div>
              )}
            </div>

            {/* Content based on status */}
            {selectedSource.status === 'completed' && selectedSource.summary && (
              <div className="animate-fade-in-up">
                <p className="text-foreground text-body leading-relaxed whitespace-pre-wrap">
                  {selectedSource.summary}
                </p>
              </div>
            )}

            {selectedSource.status === 'failed' && (
              <div className="border border-destructive/20 p-6 animate-fade-in-up" style={{ borderRadius: '2px' }}>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-meta font-semibold text-destructive mb-1">Processing Failed</h3>
                    <p className="text-meta text-muted-foreground">
                      {selectedSource.errorMessage || "An unknown error occurred during processing."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(selectedSource.status === 'uploading' || selectedSource.status === 'queued' || selectedSource.status === 'processing') && (
              <div className="py-8 animate-fade-in-up">
                <div className="space-y-3 mb-6">
                  <SkeletonLine width="90%" height="14px" />
                  <SkeletonLine width="100%" height="14px" />
                  <SkeletonLine width="75%" height="14px" />
                  <SkeletonLine width="85%" height="14px" />
                  <SkeletonLine width="60%" height="14px" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="thinking-dot" />
                  <div className="thinking-dot" />
                  <div className="thinking-dot" />
                  <span className="text-meta ml-2">{getStatusMessage(selectedSource.status)}</span>
                </div>
              </div>
            )}

            {selectedSource.status === 'completed' && !selectedSource.summary && (
              <div className="text-center py-12">
                <p className="text-meta text-muted-foreground">
                  Source processed. No summary available.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar — constant across states */}
      <div className="flex border-t border-border flex-shrink-0">
        {tabs.map((tab) => {
          const tabKey = tab.toLowerCase().replace(' ', '-');
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tabKey)}
              className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
                isActive
                  ? 'text-foreground border-t-2 border-foreground -mt-px font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{ fontSize: '11px', letterSpacing: '0.06em' }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in-up">
          <div className="bg-card text-card-foreground border border-border rounded-xl max-w-lg w-full p-8 shadow-xl relative">
            <button
              onClick={() => setShowTutorial(false)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
              aria-label="Close tutorial"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-label mb-2" style={{ color: 'var(--accent)', fontSize: '11px' }}>
              SYSTEM ARCHITECTURE
            </p>
            <h3 className="text-foreground text-display mb-6">
              How Chithhi LM Works
            </h3>
            <div className="space-y-6 text-left mb-8">
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>
                  1
                </div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Ingest Source Material</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Upload documents (PDF, DOCX, CSV, TXT), paste notes, or insert web links in the left panel. Sources are automatically vectorized and indexed.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>
                  2
                </div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Synthesize Insights</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Once processed, select any source to inspect its AI-generated executive summary and core analytical distillation in this central panel.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>
                  3
                </div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Conduct Grounded Dialogue</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Use the right panel to question your sources. Responses are strictly grounded in your documents using retrieval-augmented generation.
                  </p>
                </div>
              </div>
            </div>
            <Button
              className="w-full text-sm font-medium shadow-xs"
              onClick={() => setShowTutorial(false)}
            >
              Understood
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}