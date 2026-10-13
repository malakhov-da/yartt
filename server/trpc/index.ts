import { router } from '../trpc.ts';
import Auth from './Auth.ts';
import Employee from './Employee.ts';

// Root router: keys are the namespaces on the client (trpc.Employee.list).
const trpc = router({ Auth, Employee });

export default trpc;
export type AppRouter = typeof trpc;
