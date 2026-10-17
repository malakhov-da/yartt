import { z } from 'zod';
import { Id } from './employee.ts';

// API tokens: a program — a bot — acts as an employee (db.sql, api_token).

export const ApiToken = z.object({
  id: Id,
  name: z.string(),
  createdBy: Id,
  createdAt: z.date(),
  /** NULL — never used. */
  lastUsedAt: z.date().nullable(),
  /** NULL — it works. */
  revokedAt: z.date().nullable(),
});
export type ApiToken = z.infer<typeof ApiToken>;

export const EmployeeTokensInput = z.object({ employeeId: Id });
export type EmployeeTokensInput = z.infer<typeof EmployeeTokensInput>;

export const IssueTokenInput = z.object({ employeeId: Id, name: z.string().trim().min(1).max(100) });
export type IssueTokenInput = z.infer<typeof IssueTokenInput>;

/** The token itself: shown once, never again. */
export const IssuedToken = z.object({ token: z.string() });
export type IssuedToken = z.infer<typeof IssuedToken>;
