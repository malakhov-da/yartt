import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '#shared/types.ts';

// useTRPC().<Router>.<procedure>.queryOptions() / .mutationOptions()
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
