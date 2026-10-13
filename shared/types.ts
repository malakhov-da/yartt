// Root router type for the client. The client imports only from shared;
// this type-only import of the server never reaches the client bundle.
export type { AppRouter } from '../server/trpc/index.ts';
