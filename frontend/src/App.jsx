import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AudioProvider } from './contexts/AudioContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import AppRouter from './router.jsx';

export default function App() {
  // QueryClient 1 lần cho cả app: cache 5 phút, hết refetch trùng 19 trang
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ToastProvider>
          <AudioProvider>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </AudioProvider>
        </ToastProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
