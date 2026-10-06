import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Link,
  Loader2,
  AlertCircle,
  ExternalLink,
  FileType,
  FileSpreadsheet,
  Upload,
  X,
  HelpCircle,
} from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';
import { axiosInstance } from '../lib/axios';

const SkeletonLine = ({ width = '100%', height = '12px' }) => (
  <div className="skeleton" style={{ width, height, marginBottom: '8px' }} />
);

export default function ContentPanel() {
  const { selectedSource, getViewUrl, citationJump } = useSourceStore();
  const [isLoadingViewUrl, setIsLoadingViewUrl] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [showTutorial, setShowTutorial] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);

  const tabs = ['SUMMARY', 'DOCUMENT'];
  const sourceId = selectedSource?._id || selectedSource?.id;
  const type = selectedSource?.type;
  const isFileType = selectedSource && ['pdf', 'docx', 'csv', 'text'].includes(type);
  // Which sources can render inside an <iframe> in the browser.
  const isEmbeddable = ['pdf', 'text', 'csv'].includes(type);

  // When a citation is clicked, jump to the Document tab at the cited page.
  useEffect(() => {
    if (citationJump && citationJump.sourceId === sourceId) {
      setViewerPage(citationJump.page || 1);
      setActiveTab('document');
    }
  }, [citationJump, sourceId]);

  // Reset to the summary when switching sources.
  useEffect(() => {
    setViewerPage(1);
  }, [sourceId]);

  // React Query caches the presigned URL (valid ~1h) so switching tabs/pages doesn't refetch.
  const canViewDoc = Boolean(sourceId && isEmbeddable && selectedSource?.status === 'completed' && selectedSource?.s3Key);
  const { data: viewUrl, isLoading: isViewLoading, isError: isViewError } = useQuery({
    queryKey: ['view-url', sourceId],
    enabled: canViewDoc && activeTab === 'document',
    staleTime: 50 * 60 * 1000, // under the 1h presign expiry
    queryFn: async () => {
      const res = await axiosInstance.get(`/source/${sourceId}/view-url`);
      return res.data?.viewUrl;
    },
  });

  const getSourceIcon = (t) => {
    switch (t) {
      case 'pdf': return <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'docx': return <FileType className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'csv': return <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--accent)' }} />;
      case 'link': return <Link className="w-4 h-4 text-muted-foreground" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleViewFile = async () => {
    if (!sourceId) return;
    setIsLoadingViewUrl(true);
    const url = await getViewUrl(sourceId);
    setIsLoadingViewUrl(false);
    if (url) window.open(url, '_blank');
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'uploading': return 'Uploading to cloud...';
      case 'queued': return 'Waiting in queue...';
      case 'processing': return 'Analyzing content...';
      default: return 'Processing source...';
    }
  };

  // ── Document viewer tab ──────────────────────────────────────────────────────
  const renderDocument = () => {
    if (!selectedSource) {
      return (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-meta text-muted-foreground">Select a source to view its document.</p>
        </div>
      );
    }

    // Web links: embedding is usually blocked by the site, so offer to open it.
    if (type === 'link') {
      const url = selectedSource.rawURL || selectedSource.webURL;
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
          <Link className="w-8 h-8 text-muted-foreground/50" />
          <p className="text-meta text-muted-foreground max-w-xs">Web sources open in a new tab.</p>
          <Button asChild variant="outline" size="sm" className="text-xs">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open web source
            </a>
          </Button>
        </div>
      );
    }

    if (!isEmbeddable || !selectedSource.s3Key) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
          <FileType className="w-8 h-8 text-muted-foreground/50" />
          <p className="text-meta text-muted-foreground max-w-xs">
            In-browser preview isn't available for this file type.
          </p>
          <Button variant="outline" size="sm" onClick={handleViewFile} disabled={isLoadingViewUrl} className="text-xs">
            {isLoadingViewUrl ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1.5" />}
            Open original
          </Button>
        </div>
      );
    }

    if (selectedSource.status !== 'completed') {
      return (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-meta text-muted-foreground">{getStatusMessage(selectedSource.status)}</p>
        </div>
      );
    }

    if (isViewLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (isViewError || !viewUrl) {
      return (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-meta text-destructive">Couldn't load the document. Try “Open original”.</p>
        </div>
      );
    }

    // PDFs support the #page fragment to jump to the cited page.
    const src = type === 'pdf' ? `${viewUrl}#page=${viewerPage}` : viewUrl;
    return (
      <div className="flex-1 min-h-0">
        <iframe
          key={`${sourceId}-${viewerPage}`}
          title={selectedSource.title || 'Document'}
          src={src}
          className="w-full h-full border-0 bg-muted/20"
        />
      </div>
    );
  };

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Content Area */}
      {activeTab === 'document' ? (
        renderDocument()
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
              <Button variant="outline" onClick={() => setShowTutorial(true)} className="text-sm font-medium shadow-xs">
                <HelpCircle className="w-4 h-4 mr-2" />
                View Tutorial
              </Button>
              <Button onClick={() => document.getElementById('file-upload')?.click()} className="text-sm font-medium shadow-xs">
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
                {getSourceIcon(type)}
                <span className="text-label text-muted-foreground" style={{ fontSize: '11px' }}>
                  {type?.toUpperCase()} · {formatDate(selectedSource.createdAt)}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ml-1 ${
                  selectedSource.status === 'completed' ? 'bg-green-500' :
                  selectedSource.status === 'failed' ? 'bg-destructive' :
                  'animate-pulse'
                }`} style={selectedSource.status !== 'completed' && selectedSource.status !== 'failed' ? { background: 'var(--accent)' } : {}} />
              </div>
              <h1 className="text-foreground leading-tight mb-4" style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '-0.02em', lineHeight: '1.15' }}>
                {selectedSource.title || selectedSource.originalFileName || `${type} Source`}
              </h1>

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

              {isFileType && selectedSource.status === 'completed' && selectedSource.s3Key && (
                <div className="mt-4 flex items-center gap-2">
                  {isEmbeddable && (
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('document')} className="text-xs font-medium border-border hover:bg-muted shadow-xs">
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      View Document
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleViewFile} disabled={isLoadingViewUrl} className="text-xs font-medium border-border hover:bg-muted shadow-xs">
                    {isLoadingViewUrl ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1.5" />}
                    Open Original
                  </Button>
                </div>
              )}
            </div>

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
                <p className="text-meta text-muted-foreground">Source processed. No summary available.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-t border-border flex-shrink-0">
        {tabs.map((tab) => {
          const tabKey = tab.toLowerCase();
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
            <h3 className="text-foreground text-display mb-6">How Chithhi LM Works</h3>
            <div className="space-y-6 text-left mb-8">
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>1</div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Ingest Source Material</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Upload documents (PDF, DOCX, CSV, TXT), paste notes, or insert web links in the left panel. Sources are automatically vectorized and indexed.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>2</div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Synthesize Insights</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Once processed, select any source to inspect its AI-generated executive summary, or open the Document tab to read the original.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 border border-border rounded-md flex items-center justify-center flex-shrink-0 text-meta font-semibold" style={{ color: 'var(--accent)' }}>3</div>
                <div>
                  <h4 className="text-foreground text-meta font-semibold mb-1">Conduct Grounded Dialogue</h4>
                  <p className="text-muted-foreground text-meta leading-relaxed">
                    Use the right panel to question your sources. Click a citation to jump to the exact page in the Document tab.
                  </p>
                </div>
              </div>
            </div>
            <Button className="w-full text-sm font-medium shadow-xs" onClick={() => setShowTutorial(false)}>
              Understood
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
