import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { StecSecureProvider } from '@/lib/stecsecure-context';
import { router } from '@/router';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <StecSecureProvider>
        <RouterProvider router={router} />
        <Toaster
          theme="dark"
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: '#0f172a',
              borderColor: '#334155',
              color: '#f8fafc',
            },
          }}
        />
      </StecSecureProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
