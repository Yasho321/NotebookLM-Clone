import { useEffect, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSourceStore } from '../stores/sourceStore';
import AuthForm from '../components/AuthForm';
import Header from '../components/Header';
import WorkspaceLayout from '../components/WorkspaceLayout';
import CommandPalette from '../components/CommandPalette';

// The marketing landing page is large and only shown to logged-out visitors on "/".
// Lazy-load it so it isn't bundled into the authenticated workspace's critical path.
const LandingPage = lazy(() => import('./LandingPage'));

const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <img
        src="/logo.png"
        alt="Chithhi LM Logo"
        className="w-12 h-12 object-contain animate-pulse drop-shadow-sm dark:drop-shadow-[0_4px_16px_rgba(255,255,255,0.18)] select-none"
      />
      <div className="flex gap-1 mt-1">
        <div className="thinking-dot"></div>
        <div className="thinking-dot"></div>
        <div className="thinking-dot"></div>
      </div>
      <span className="text-meta text-muted-foreground tracking-wide uppercase text-xs">Loading Workspace</span>
    </div>
  </div>
);

const Index = () => {
  const { authUser, isCheckingAuth, checkAuth } = useAuthStore();
  const { fetchSources } = useSourceStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Global Cmd/Ctrl+K toggles the command palette (only matters once authed).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchSources();
      // If user is authed and on / or /auth, redirect to /workspace
      if (location.pathname === '/' || location.pathname === '/auth') {
        navigate('/workspace', { replace: true });
      }
    } else if (!isCheckingAuth && location.pathname === '/workspace') {
      navigate('/auth', { replace: true });
    }
  }, [authUser, isCheckingAuth, fetchSources, location.pathname, navigate]);

  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Not authenticated
  if (!authUser) {
    // Show auth form on /auth or /workspace, landing on /
    if (location.pathname === '/auth' || location.pathname === '/workspace') {
      return <AuthForm />;
    }
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <LandingPage />
      </Suspense>
    );
  }

  // Authenticated — show workspace
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      <WorkspaceLayout />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
};

export default Index;