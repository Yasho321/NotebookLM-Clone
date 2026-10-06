import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Link, Upload, Loader2, FileType, FileSpreadsheet, AlertCircle, Check, Lock, Trash2, X, MoreVertical, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { useSourceStore } from '../stores/sourceStore';
import { useChatStore } from '../stores/chatStore';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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
    isLoading,
    addTextSource,
    addFileSource,
    addUrlSource,
    selectSource,
    toggleSourceSelection,
    selectAllSources,
    clearSourceSelection,
    deleteSource,
    renameSource,
    expanded,
    setExpanded,
    hasMore,
    isLoadingMore,
    loadMoreSources,
  } = useSourceStore();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const isChatActive = Boolean(activeChatId);
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [file, setFile] = useState(null);
  const [activeInput, setActiveInput] = useState('text');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const COLLAPSED_COUNT = 6;
  const visibleSources = expanded ? sources : sources.slice(0, COLLAPSED_COUNT);
  const hasExtra = sources.length > COLLAPSED_COUNT || hasMore;

  // Infinite scroll: when expanded and the user nears the bottom, fetch the next page.
  const handleListScroll = (e) => {
    if (!expanded || !hasMore || isLoadingMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadMoreSources();
    }
  };

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
      <div className="flex-1 overflow-y-auto p-5" onScroll={handleListScroll}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground font-semibold" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
              LIBRARY
            </span>
            {sources.length > 0 && (
              <span className="text-micro font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                {selectedSourceIds.length}/{sources.length} active
              </span>
            )}
          </div>
          {sources.length > 0 && (
            isChatActive ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1 text-mini text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/60 cursor-default"
                  title="Source selection is locked for this active dialogue. Start a new dialogue to change sources."
                >
                  <Lock className="w-3 h-3 text-muted-foreground" />
                  <span>Locked</span>
                </div>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="text-mini font-medium text-foreground hover:underline transition-colors cursor-pointer"
                  title="Start a new dialogue to choose different sources"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-mini">
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
          {visibleSources.map((source) => {
            const id = source._id || source.id;
            const isChecked = selectedSourceIds.includes(id);
            const isViewing = selectedSource?._id === id;
            const isEditing = editingId === id;
            const displayName = source.title || source.originalFileName || `${source.type} source`;

            const saveRename = async () => {
              const t = editTitle.trim();
              setEditingId(null);
              if (t && t !== source.title) await renameSource(id, t);
            };

            return (
              <div
                key={id}
                className={`group relative p-2.5 rounded-md transition-all border ${
                  isViewing
                    ? 'bg-muted/60 border-foreground/30 shadow-xs'
                    : isChecked
                    ? 'border-border/80 hover:bg-muted/30'
                    : 'border-transparent opacity-75 hover:opacity-100 hover:bg-muted/20'
                } ${isEditing ? '' : 'cursor-pointer'}`}
                onClick={() => !isEditing && selectSource(source)}
              >
                <div className="flex items-start gap-2.5">
                  {/* Selection checkbox (locked to the active dialogue) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isChatActive) {
                        toast.info("Sources are locked to the current dialogue. Click '+ New' to start a new dialogue with different sources.");
                      } else {
                        toggleSourceSelection(id);
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
                    aria-label={`Toggle source ${displayName}`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div className="flex-shrink-0 mt-0.5">{getSourceIcon(source.type)}</div>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={saveRename}
                        className="w-full px-1.5 py-0.5 rounded text-meta font-semibold bg-background border border-foreground/40 focus:outline-none"
                      />
                    ) : (
                      <p className="text-meta font-semibold text-foreground truncate leading-snug">
                        {displayName}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground" style={{ fontSize: '11px' }}>
                        {getTypeLabel(source.type)}
                      </span>
                      <StatusBadge status={source.status} />
                    </div>
                  </div>

                  {/* Kebab menu: Rename / Delete (portaled, always clickable) */}
                  {!isEditing && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 -mr-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:text-foreground hover:bg-muted transition-all cursor-pointer flex-shrink-0"
                          aria-label={`Actions for ${displayName}`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditTitle(source.title || source.originalFileName || '');
                            setEditingId(id);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={() => deleteSource(id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && sources.length === 0 && (
            <div className="space-y-1 animate-fade-in" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-2.5 flex items-start gap-2.5">
                  <div className="skeleton" style={{ width: '16px', height: '16px', borderRadius: '4px' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton" style={{ width: '80%', height: '12px' }} />
                    <div className="skeleton" style={{ width: '45%', height: '10px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && sources.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-meta text-muted-foreground">No sources indexed</p>
            </div>
          )}

          {/* Show more / Show less + infinite-scroll loader */}
          {hasExtra && (
            <div className="pt-2">
              {!expanded ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-mini font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show more
                </button>
              ) : (
                <>
                  {isLoadingMore && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 text-mini font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    Show less
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}