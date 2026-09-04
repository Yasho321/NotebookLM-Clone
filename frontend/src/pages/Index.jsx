import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSourceStore } from '../stores/sourceStore';
import AuthForm from '../components/AuthForm';
import Header from '../components/Header';
import WorkspaceLayout from '../components/WorkspaceLayout';
import LandingPage from './LandingPage';

const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-1">
        <div className="thinking-dot"></div>
        <div className="thinking-dot"></div>
        <div className="thinking-dot"></div>
      </div>
      <span className="text-meta text-muted-foreground tracking-wide uppercase">Loading</span>
    </div>
  </div>
);

const Index = () => {
  const { authUser, isCheckingAuth, checkAuth } = useAuthStore();
  const { fetchSources } = useSourceStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
    return <LandingPage />;
  }

  // Authenticated — show workspace
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      <WorkspaceLayout />
    </div>
  );
};

export default Index;