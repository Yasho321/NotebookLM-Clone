import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Link, Upload, Loader2, FileType, FileSpreadsheet, AlertCircle, CheckSquare, Square, Check, Lock } from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';
import { useChatStore } from '../stores/chatStore';
import { toast } from 'sonner';

const getSourceIcon = (type) => {
  switch (type) {
    case 'pdf':
      return <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />;
    case 'docx':
      return <FileType className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />;
    case 'csv':
      return <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />;
    case 'text':
    case 'text-paste':
      return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'link':
      return <Link className="w-3.5 h-3.5 text-muted-foreground" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const getTypeLabel = (type) => {
  switch (type) {
    case 'pdf': return 'PDF DOCUMENT';
    case 'docx': return 'DOCX FILE';
    case 'csv': return 'CSV DATA';
    case 'text':
    case 'text-paste': return 'TEXT SNIPPET';
    case 'link': return 'WEB SOURCE';
    default: return 'SOURCE';
  }
};

const StatusBadge = ({ status }) => {
  switch (status) {
    case 'uploading':
    case 'queued':
    case 'processing':
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }}></div>
          <span className="text-muted-foreground capitalize" style={{ fontSize: '11px' }}>{status}</span>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span className="text-destructive" style={{ fontSize: '11px' }}>Failed</span>
        </div>
      );
    default:
      return null; // 'completed' — no badge
  }
};

export default function SourcePanel() {
  const {
    sources,
    selectedSource,
    selectedSourceIds,
    isUploading,
    addTextSource,
    addFileSource,
    addUrlSource,
    selectSource,
    toggleSourceSelection,
    selectAllSources,
    clearSourceSelection,
  } = useSourceStore();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const isChatActive = Boolean(activeChatId);
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [file, setFile] = useState(null);
  const [activeInput, setActiveInput] = useState('text');

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    const result = await addTextSource(textInput);
    if (result.success) setTextInput('');
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    const result = await addUrlSource(urlInput);
    if (result.success) setUrlInput('');
  };

  const handleFileSubmit = async () => {
    if (!file) return;
    const result = await addFileSource(file);
    if (result.success) setFile(null);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const allowedTypes = ['.pdf', '.docx', '.csv', '.txt'];
      const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();
      if (allowedTypes.includes(fileExtension)) {
        setFile(selectedFile);
      } else {
        toast.error('Please upload PDF, DOCX, CSV, or TXT files only');
        e.target.value = '';
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Input Section */}
      <div className="p-5 border-b border-border space-y-4 flex-shrink-0">
        {/* Input type switcher */}
        <div className="flex bg-muted/60 p-1 rounded-lg gap-1 mb-3">
          {['text', 'upload', 'url'].map((type) => (
            <button
              key={type}
              onClick={() => setActiveInput(type)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeInput === type
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {type === 'text' ? 'Quick Text' : type === 'upload' ? 'Upload File' : 'Web URL'}
            </button>
          ))}
        </div>

        {/* Text input */}
        {activeInput === 'text' && (
          <div className="space-y-3">
            <Textarea
              placeholder="Paste notes or text for ingestion..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="bg-background border border-border resize-none text-body min-h-[100px] rounded-lg focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all placeholder:text-muted-foreground/50"
            />
            <Button
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || isUploading}
              className="w-full text-sm font-medium shadow-xs"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Ingest Fragment
            </Button>
          </div>
        )}

        {/* File upload */}
        {activeInput === 'upload' && (
          <div className="space-y-3">
            <div
              className="border border-dashed border-border rounded-lg p-6 text-center hover:border-foreground/50 hover:bg-muted/30 transition-all cursor-pointer"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,.csv,.txt"
              />
              <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <p className={`text-sm ${file ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                {file ? file.name : "Click to select file"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                PDF, DOCX, CSV, TXT
              </p>
            </div>
            <Button
              onClick={handleFileSubmit}
              disabled={!file || isUploading}
              className="w-full text-sm font-medium shadow-xs"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload File
            </Button>
          </div>
        )}

        {/* URL input */}
        {activeInput === 'url' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="https://..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="bg-background border border-border rounded-lg text-sm text-foreground focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all placeholder:text-muted-foreground/50 flex-1 h-10 px-3.5"
              />
              <Button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim() || isUploading}
                size="icon"
                className="h-10 w-10 rounded-lg shadow-xs flex-shrink-0"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground font-semibold" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
              LIBRARY
            </span>
            {sources.length > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                {selectedSourceIds.length}/{sources.length} active
              </span>
            )}
          </div>
          {sources.length > 0 && (
            isChatActive ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/60 cursor-default"
                  title="Source selection is locked for this active dialogue. Start a new dialogue to change sources."
                >
                  <Lock className="w-3 h-3 text-muted-foreground" />
                  <span>Locked</span>
                </div>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="text-[11px] font-medium text-foreground hover:underline transition-colors cursor-pointer"
                  title="Start a new dialogue to choose different sources"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllSources}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Include all sources in queries"
                >
                  All
                </button>
                <span className="text-border">·</span>
                <button
                  type="button"
                  onClick={clearSourceSelection}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear all selected sources"
                >
                  None
                </button>
              </div>
            )
          )}
        </div>

        <div className="space-y-1">
          {sources.map((source) => {
            const isChecked = selectedSourceIds.includes(source._id || source.id);
            const isViewing = selectedSource?._id === (source._id || source.id);

            return (
              <div
                key={source._id || source.id}
                className={`p-2.5 rounded-md cursor-pointer transition-all border ${
                  isViewing
                    ? 'bg-muted/60 border-foreground/30 shadow-xs'
                    : isChecked
                    ? 'border-border/80 hover:bg-muted/30'
                    : 'border-transparent opacity-75 hover:opacity-100 hover:bg-muted/20'
                }`}
                onClick={() => selectSource(source)}
              >
                <div className="flex items-start gap-2.5">
                  {/* Selection Checkbox for Querying (Locked when chat is active) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isChatActive) {
                        toast.info("Sources are locked to the current dialogue. Click '+ New' to start a new dialogue with different sources.");
                      } else {
                        toggleSourceSelection(source._id || source.id);
                      }
                    }}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                      isChatActive
                        ? isChecked
                          ? 'bg-muted border-foreground/40 text-foreground cursor-not-allowed opacity-90'
                          : 'border-border/30 bg-muted/10 text-transparent cursor-not-allowed opacity-25'
                        : isChecked
                        ? 'bg-primary border-primary text-primary-foreground cursor-pointer'
                        : 'border-border hover:border-foreground/50 bg-background cursor-pointer'
                    }`}
                    title={
                      isChatActive
                        ? isChecked
                          ? "Source is part of this active dialogue (locked). Start a new dialogue to change sources."
                          : "Source is not part of this dialogue (locked). Start a new dialogue to change sources."
                        : isChecked
                        ? "Source included in next dialogue (click to exclude)"
                        : "Source excluded from next dialogue (click to include)"
                    }
                    aria-label={`Toggle source ${source.title || source.originalFileName}`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div className="flex-shrink-0 mt-0.5">
                    {getSourceIcon(source.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-meta font-semibold text-foreground truncate leading-snug">
                      {source.title || source.originalFileName || `${source.type} source`}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground" style={{ fontSize: '11px' }}>
                        {getTypeLabel(source.type)}
                      </span>
                      <StatusBadge status={source.status} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {sources.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-meta text-muted-foreground">
                No sources indexed
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}