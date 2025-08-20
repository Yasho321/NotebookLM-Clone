import { Card } from "@/components/ui/card";
import { FileText, Link, Calendar, Sparkles } from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';

export default function ContentPanel() {
  const { selectedSource } = useSourceStore();

  if (!selectedSource) {
    return (
      <div className="flex-1 bg-background flex items-center justify-center">
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
                {selectedSource.title || `${selectedSource.type} Source`}
              </h1>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(selectedSource.createdAt)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
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
            </div>
          </div>
        </Card>

        {/* Summary Section */}
        {selectedSource.summary && (
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

        {/* Processing Status */}
        {!selectedSource.summary && (
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-info border-t-transparent rounded-full animate-spin"></div>
              <span>Processing source...</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}