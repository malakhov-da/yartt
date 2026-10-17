import { CssBaseline, ThemeProvider } from '@mui/material';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import superjson from 'superjson';
import type { AppRouter } from '#shared/types.ts';
import App from './components/App.tsx';
import { offlineLink, restoreCache, startOffline } from './hooks/offline.ts';
import { showError } from './hooks/store.ts';
import { TRPCProvider } from './hooks/trpc.ts';
import './i18n/index.ts';
import theme from './theme.ts';

const http = () => httpBatchLink({ url: '/api/trpc', transformer: superjson });
// Offline, a change goes to the outbox and is sent later by the plain client (decision 43).
const trpcClient = createTRPCClient<AppRouter>({ links: [offlineLink(), http()] });
// The outbox sends by path, so it needs the untyped client.
const outboxClient = createTRPCUntypedClient<AppRouter>({ links: [http()] });

// Every failed query and mutation shows a translated snackbar.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: showError }),
  // A mutation that shows its error itself says so: meta: { quiet: true }.
  mutationCache: new MutationCache({ onError: (error, _v, _c, mutation) => { if (!mutation.meta?.quiet) showError(error); } }),
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
    // Mutations always reach the links: the offline link decides what waits.
    mutations: { retry: false, networkMode: 'always' },
  },
});

restoreCache(queryClient);
startOffline(outboxClient, queryClient);
if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <BrowserRouter>
            <CssBaseline />
            <App />
          </BrowserRouter>
        </TRPCProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
