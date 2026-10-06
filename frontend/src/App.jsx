import { useEffect, lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useThemeStore } from './stores/themeStore';
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// The admin dashboard is heavy and rarely used — load it only when its route is visited.
const Dashboard = lazy(() => import("./pages/Dashboard"));

const queryClient = new QueryClient();

function ThemeInit() {
  const initTheme = useThemeStore((s) => s.initTheme);
  useEffect(() => { initTheme(); }, [initTheme]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeInit />
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Index />} />
            <Route path="/workspace" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/evals" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
