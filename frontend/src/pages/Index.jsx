import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSourceStore } from '../stores/sourceStore';
import AuthForm from '../components/AuthForm';
import Header from '../components/Header';
import SourcePanel from '../components/SourcePanel';
import ContentPanel from '../components/ContentPanel';
import ChatPanel from '../components/ChatPanel';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

const Index = () => {
  const { authUser, isCheckingAuth, checkAuth } = useAuthStore();
  const { fetchSources } = useSourceStore();
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  useEffect(() => {
    if (authUser) {
      fetchSources();
    }
  }, [authUser, fetchSources]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <AuthForm />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
            },
          }}
        />
      </>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <SourcePanel />
        <ContentPanel />
        <ChatPanel />
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </div>
  );
};

export default Index;