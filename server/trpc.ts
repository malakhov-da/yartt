import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorData, ErrorIssue } from '#shared/errors.ts';
import type { Context } from './ctx.ts';
import { AppError, fromPostgres } from './errors.ts';

function errorData(error: TRPCError): ErrorData {
  const cause = error.cause;
  if (cause instanceof AppError) return { appCode: cause.code, params: cause.params };

  // Input validation: issues go to the client without English messages,
  // the client renders them in the user's language.
  if (error.code === 'BAD_REQUEST' && cause instanceof ZodError) {
    const issues = cause.issues.map(({ message: _message, input: _input, ...issue }) => issue as ErrorIssue);
    return { appCode: 'invalid_input', issues };
  }

  const byTrpcCode: Partial<Record<TRPCError['code'], ErrorCode>> = {
    UNAUTHORIZED: 'unauthorized',
    FORBIDDEN: 'forbidden',
    NOT_FOUND: 'not_found',
    BAD_REQUEST: 'invalid_input',
  };
  return { appCode: byTrpcCode[error.code] ?? 'internal' };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const data = errorData(error);
    if (data.appCode === 'internal') console.error(error);
    return {
      ...shape,
      message: data.appCode,
      data: { code: shape.data.code, httpStatus: shape.data.httpStatus, path: shape.data.path, ...data },
    };
  },
});

function toTrpcError(cause: AppError): TRPCError {
  const code =
    cause.code === 'forbidden' ? 'FORBIDDEN'
    : cause.code === 'not_found' ? 'NOT_FOUND'
    : cause.code === 'unauthorized' ? 'UNAUTHORIZED'
    : 'BAD_REQUEST';
  return new TRPCError({ code, message: cause.code, cause });
}

// Business errors (AppError and Postgres errors) -> code the client understands.
const mapErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok) {
    const cause = result.error.cause;
    const appError = cause instanceof AppError ? cause : fromPostgres(cause);
    if (appError) throw toTrpcError(appError);
  }
  return result;
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Available without a session. */
export const procedure = t.procedure.use(mapErrors);

/** Requires a session; `ctx.employeeId` is the signed-in employee. */
export const authedProcedure = procedure.use(({ ctx, next }) => {
  if (ctx.employeeId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, employeeId: ctx.employeeId } });
});
