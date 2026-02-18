import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { MainLayout } from "@/components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import PanelGrid from "./pages/PanelGrid";
import Tickets from "./pages/Tickets";
import Analytics from "./pages/Analytics";
import Technicians from "./pages/Technicians";
import Settings from "./pages/Settings";
import Scans from "./pages/Scans";
import NotFound from "./pages/NotFound";

// Configure React Query with caching to reduce unnecessary refetches
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds - reduces API calls
      staleTime: 30 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Don't refetch on window focus for critical data
      refetchOnWindowFocus: false,
      // Retry failed requests once
      retry: 1,
      // Don't show error toast immediately
      throwOnError: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/panels" element={<PanelGrid />} />
              <Route path="/tickets" element={<Tickets />} />
<Route path="/analytics" element={<Analytics />} />
              <Route path="/technicians" element={<Technicians />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/scans" element={<Scans />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
