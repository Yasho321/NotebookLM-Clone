import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Link, Calendar, Sparkles, Loader2, AlertCircle, ExternalLink, FileType, FileSpreadsheet } from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';

export default function ContentPanel() {
  const { selectedSource, getViewUrl } = useSourceStore();
  const [isLoadingViewUrl, setIsLoadingViewUrl] = useState(false);

  if (!selectedSource) {
    return (
      <div className="flex-1 max-w-2xl bg-background flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Add a source to get started
          </h2>
          <p className="text-muted-foreground max-w-md">
            Upload documents, paste text, or add web URLs to begin analyzing and chatting with your content.
          </p>
        </div>
      </div>
    );
  }

  const getSourceIcon = (type) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-400" />;
      case 'docx':
        return <FileType className="w-5 h-5 text-blue-400" />;
      case 'csv':
        return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
      case 'link':
        return <Link className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewFile = async () => {
    const sourceId = selectedSource?._id || selectedSource?.id;
    if (!sourceId) return;
    setIsLoadingViewUrl(true);
    const url = await getViewUrl(sourceId);
    setIsLoadingViewUrl(false);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const isFileType = ['pdf', 'docx', 'csv', 'text'].includes(selectedSource.type);

  const getStatusMessage = (status) => {
    switch (status) {
      case 'uploading':
        return 'Uploading to cloud...';
      case 'queued':
        return 'Waiting in queue...';
      case 'processing':
        return 'Analyzing content...';
      default:
        return 'Processing source...';
    }
  };

  return (
    <div className="flex-1 bg-background p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Source Header */}
        <Card className="p-6 mb-6 bg-card border-border">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 p-3 bg-accent rounded-lg">
              {getSourceIcon(selectedSource.type)}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {selectedSource.title || selectedSource.originalFileName || `${selectedSource.type} Source`}
              </h1>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(selectedSource.createdAt)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    selectedSource.status === 'completed' ? 'bg-success' :
                    selectedSource.status === 'failed' ? 'bg-destructive' :
                    'bg-info animate-pulse'
                  }`}></div>
                  <span className="capitalize">{selectedSource.type}</span>
                </div>
              </div>
              {selectedSource.rawURL && (
                <a
                  href={selectedSource.rawURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-info hover:underline mt-2 inline-block"
                >
                  {selectedSource.rawURL}
                </a>
              )}
              {selectedSource.webURL && (
                <a
                  href={selectedSource.webURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-info hover:underline mt-2 inline-block"
                >
                  {selectedSource.webURL}
                </a>
              )}
              {/* View Original File button — only for completed file sources */}
              {isFileType && selectedSource.status === 'completed' && selectedSource.s3Key && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewFile}
                    disabled={isLoadingViewUrl}
                    className="text-xs"
                  >
                    {isLoadingViewUrl ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3 h-3 mr-1" />
                    )}
                    View Original File
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Status-specific content */}
        {selectedSource.status === 'completed' && selectedSource.summary && (
          /* Summary Section — completed sources */
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center space-x-2 mb-4">
              <Sparkles className="w-5 h-5 text-info" />
              <h2 className="text-lg font-semibold text-foreground">AI Summary</h2>
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-foreground leading-relaxed">
                {selectedSource.summary}
              </p>
            </div>
          </Card>
        )}

        {selectedSource.status === 'failed' && (
          /* Failed status */
          <Card className="p-6 bg-card border-border border-destructive/30">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-destructive">Processing Failed</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedSource.errorMessage || "An unknown error occurred during processing."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {(selectedSource.status === 'uploading' || selectedSource.status === 'queued' || selectedSource.status === 'processing') && (
          /* In-progress status */
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-center space-x-3 text-muted-foreground py-4">
              <Loader2 className="w-5 h-5 animate-spin text-info" />
              <span className="text-sm">{getStatusMessage(selectedSource.status)}</span>
            </div>
          </Card>
        )}

        {selectedSource.status === 'completed' && !selectedSource.summary && (
          /* Completed but no summary (edge case) */
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <span>Source processed. No summary available.</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}