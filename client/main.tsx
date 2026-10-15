import { CssBaseline, ThemeProvider } from '@mui/material';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import superjson from 'superjson';
import type { AppRouter } from '#shared/types.ts';
import App from './components/App.tsx';
import { showError } from './hooks/store.ts';
import { TRPCProvider } from './hooks/trpc.ts';
import './i18n/index.ts';
import theme from './theme.ts';

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
});

// Every failed query and mutation shows a translated snackbar.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: showError }),
  // A mutation that shows its error itself says so: meta: { quiet: true }.
  mutationCache: new MutationCache({ onError: (error, _v, _c, mutation) => { if (!mutation.meta?.quiet) showError(error); } }),
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

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
