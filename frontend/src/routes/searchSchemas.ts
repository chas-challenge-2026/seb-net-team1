import { z } from 'zod';
import { AUDIT_ACTIONS } from '../utils/labels';

/*
 * Search-param schemas for the routes. Every field is optional and falls back to
 * undefined when the URL holds something invalid, so a hand-edited or outdated link
 * never breaks a page. Defaults are applied where the values are used, which keeps
 * default values out of the URL.
 *
 * The router's parser turns "2" into 2 and "true" into true (see router.tsx), so
 * free text is accepted as string, number or boolean and normalized to a string.
 */

const text = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value).trim().slice(0, 200) || undefined)
  .optional()
  .catch(undefined);

const positiveInt = z.number().int().positive().optional().catch(undefined);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const flag = z.boolean().optional().catch(undefined);

export const loginSearchSchema = z.object({
  /** Where to go after logging in (a path inside the app). */
  redirect: z.string().optional().catch(undefined),
  /** Why the user ended up on the login page. */
  reason: z.enum(['expired']).optional().catch(undefined),
});

export const paymentsSearchSchema = z.object({
  status: z.enum(['pending_approval', 'completed', 'rejected']).optional().catch(undefined),
  accountId: positiveInt,
  search: text,
  fromDate: isoDate,
  toDate: isoDate,
  /** Only payments created by the current user. */
  mine: flag,
  page: positiveInt,
});
export type PaymentsSearch = z.output<typeof paymentsSearchSchema>;

export const newPaymentSearchSchema = z.object({
  fromAccountId: positiveInt,
});

export const approvalsSearchSchema = z.object({
  tab: z.enum(['pending', 'handled']).optional().catch(undefined),
});

export const accountDetailSearchSchema = z.object({
  tab: z.enum(['transactions', 'payments']).optional().catch(undefined),
  page: positiveInt,
});

export const auditLogSearchSchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional().catch(undefined),
});

export const REPORT_PERIODS = [3, 6, 12] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const reportsSearchSchema = z.object({
  months: z
    .union([z.literal(3), z.literal(6), z.literal(12)])
    .optional()
    .catch(undefined),
});

export const settingsSearchSchema = z.object({
  tab: z.enum(['profile', 'security', 'users']).optional().catch(undefined),
});

/** Only same-app paths are allowed as a post-login target (no open redirects). */
export function safeRedirect(target: string | undefined): string | undefined {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return undefined;
  if (target === '/' || target.startsWith('/login')) return undefined;
  return target;
}
