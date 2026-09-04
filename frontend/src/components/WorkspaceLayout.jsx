import { useCallback, useRef, useEffect, useState } from 'react';
import { usePanelStore } from '../stores/panelStore';
import SourcePanel from './SourcePanel';
import ContentPanel from './ContentPanel';
import ChatPanel from './ChatPanel';
import { PanelLeftClose, PanelRightClose, Maximize2, Minimize2 } from 'lucide-react';

function PanelDivider({ onDrag }) {
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      if (isDragging.current) {
        onDrag(e.clientX);
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onDrag]);

  return (
    <div
      className="panel-divider"
      onMouseDown={handleMouseDown}
    />
  );
}

function PanelHeader({ label, onCollapse, onFullscreen, isFullscreen, collapseIcon: CollapseIcon }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
      <span className="text-label text-muted-foreground" style={{ fontSize: '11px' }}>{label}</span>
      <div className="flex items-center gap-1">
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
            aria-label={isFullscreen ? 'Restore panel' : 'Maximize panel'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
            aria-label="Toggle panel"
          >
            <CollapseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Mobile tab bar
function MobileTabBar({ activeTab, setActiveTab }) {
  const tabs = [
    { key: 'source', label: 'SOURCES' },
    { key: 'content', label: 'SYNTHESIS' },
    { key: 'chat', label: 'DIALOGUE' },
  ];

  return (
    <div className="flex border-b border-border md:hidden flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`flex-1 py-3 text-center transition-colors ${
            activeTab === tab.key
              ? 'text-foreground border-b-2 border-foreground'
              : 'text-muted-foreground'
          }`}
          style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '0.08em' }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function WorkspaceLayout() {
  const {
    sourceWidth,
    chatWidth,
    sourceCollapsed,
    chatCollapsed,
    fullscreenPanel,
    setSourceWidth,
    setChatWidth,
    toggleSourceCollapsed,
    toggleChatCollapsed,
    toggleFullscreen,
    activeTab,
    setActiveTab,
  } = usePanelStore();

  const containerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSourceDrag = useCallback((clientX) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setSourceWidth(clientX - rect.left);
    }
  }, [setSourceWidth]);

  const handleChatDrag = useCallback((clientX) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setChatWidth(rect.right - clientX);
    }
  }, [setChatWidth]);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileTabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 overflow-hidden">
          {activeTab === 'source' && (
            <div className="h-full overflow-y-auto">
              <SourcePanel />
            </div>
          )}
          {activeTab === 'content' && (
            <div className="h-full overflow-y-auto">
              <ContentPanel />
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="h-full overflow-hidden flex flex-col">
              <ChatPanel />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fullscreen single panel
  if (fullscreenPanel) {
    const panels = {
      source: { component: SourcePanel, label: 'SOURCES & INGESTION' },
      content: { component: ContentPanel, label: 'INTELLECT SYNTHESIS' },
      chat: { component: ChatPanel, label: 'EXPERT DIALOGUE' },
    };
    const { component: PanelComponent, label } = panels[fullscreenPanel];

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PanelHeader
          label={label}
          onFullscreen={() => toggleFullscreen(fullscreenPanel)}
          isFullscreen={true}
        />
        <div className="flex-1 overflow-hidden">
          <PanelComponent />
        </div>
      </div>
    );
  }

  // Desktop three-panel layout
  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden workspace-panels">
      {/* Source Panel */}
      {!sourceCollapsed ? (
        <div
          className="flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: `${sourceWidth}px` }}
        >
          <PanelHeader
            label="SOURCES & INGESTION"
            onCollapse={toggleSourceCollapsed}
            onFullscreen={() => toggleFullscreen('source')}
            isFullscreen={false}
            collapseIcon={PanelLeftClose}
          />
          <div className="flex-1 overflow-hidden">
            <SourcePanel />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-3 px-1 border-r border-border flex-shrink-0">
          <button
            onClick={toggleSourceCollapsed}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
            aria-label="Expand source panel"
            style={{ writingMode: 'vertical-lr' }}
          >
            <span className="text-label" style={{ fontSize: '10px' }}>SOURCES</span>
          </button>
        </div>
      )}

      {!sourceCollapsed && <PanelDivider onDrag={handleSourceDrag} />}

      {/* Content Panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <PanelHeader
          label="INTELLECT SYNTHESIS"
          onFullscreen={() => toggleFullscreen('content')}
          isFullscreen={false}
        />
        <div className="flex-1 overflow-hidden">
          <ContentPanel />
        </div>
      </div>

      {!chatCollapsed && <PanelDivider onDrag={handleChatDrag} />}

      {/* Chat Panel */}
      {!chatCollapsed ? (
        <div
          className="flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: `${chatWidth}px` }}
        >
          <PanelHeader
            label="EXPERT DIALOGUE"
            onCollapse={toggleChatCollapsed}
            onFullscreen={() => toggleFullscreen('chat')}
            isFullscreen={false}
            collapseIcon={PanelRightClose}
          />
          <div className="flex-1 overflow-hidden flex flex-col">
            <ChatPanel />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-3 px-1 border-l border-border flex-shrink-0">
          <button
            onClick={toggleChatCollapsed}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
            aria-label="Expand chat panel"
            style={{ writingMode: 'vertical-lr' }}
          >
            <span className="text-label" style={{ fontSize: '10px' }}>DIALOGUE</span>
          </button>
        </div>
      )}
    </div>
  );
}
