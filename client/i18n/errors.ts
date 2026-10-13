import { TRPCClientError } from '@trpc/client';
import type { z } from 'zod';
import { en as zodEn, ru as zodRu } from 'zod/locales';
import { isErrorCode, type ErrorData, type ErrorIssue } from '#shared/errors.ts';
import type { Locale } from '#shared/employee.ts';
import i18n from './index.ts';

const ZOD_LOCALES: Record<Locale, () => { localeError: z.core.$ZodErrorMap }> = {
  ru: zodRu,
  en: zodEn,
};

/** `error.data` added by the server, or null for non-server errors. */
export function errorData(error: unknown): ErrorData | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data = error.data as Partial<ErrorData> | undefined;
  return isErrorCode(data?.appCode) ? (data as ErrorData) : null;
}

/** Translated message for any error, in the current language. */
export function errorMessage(error: unknown): string {
  const data = errorData(error);
  if (!data) return i18n.t('errors.internal');
  return i18n.t(`errors.${data.appCode}`, data.params ?? {});
}

function issueMessage(issue: ErrorIssue): string {
  const locale = (i18n.language in ZOD_LOCALES ? i18n.language : 'ru') as Locale;
  const result = ZOD_LOCALES[locale]().localeError(issue as Parameters<z.core.$ZodErrorMap>[0]);
  const message = typeof result === 'string' ? result : result?.message;
  return message ?? i18n.t('errors.invalid_input');
}

/**
 * Validation messages by top-level field name, translated with zod's own
 * locales: `{ email: 'Invalid email address' }`.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of errorData(error)?.issues ?? []) {
    const field = String(issue.path[0] ?? '');
    result[field] ??= issueMessage(issue);
  }
  return result;
}
