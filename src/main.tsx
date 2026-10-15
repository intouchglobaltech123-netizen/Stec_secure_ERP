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

// Phones show list tables as stacked cards (styles.css: table.stack-on-phone). Each cell gets its
// column heading as data-label, shown next to the value. Runs after React updates the page.
function labelTablesForPhones() {
  document.querySelectorAll<HTMLTableElement>('table.stack-on-phone').forEach((table) => {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) =>
      (th.textContent || '').replace(/\s+/g, ' ').trim()
    );
    table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
      let col = 0;
      Array.from(tr.children).forEach((cell) => {
        const span = (cell as HTMLTableCellElement).colSpan || 1;
        const label = span > 1 ? '' : heads[col] || '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        col += span;
      });
    });
  });
}
let labelQueued = false;
new MutationObserver(() => {
  if (labelQueued) return;
  labelQueued = true;
  requestAnimationFrame(() => {
    labelQueued = false;
    labelTablesForPhones();
  });
}).observe(document.body, { childList: true, subtree: true });
