import { z } from 'zod';

/** Date-range picker on the dashboard ("Last 30 days"). */
export const rangeEnum = z.enum(['7d', '30d', '90d', '12m']).default('30d').describe('Reporting window; changePct compares it with the window before it');
export type Range = z.infer<typeof rangeEnum>;

const DAY = 86_400_000;
const lengths: Record<Range, number> = { '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY };

/** Current window [from, to) and the equally long window before it [prevFrom, from). */
export function rangeWindow(range: Range, now = Date.now()) {
  const len = lengths[range];
  return { to: new Date(now).toISOString(), from: new Date(now - len).toISOString(), prevFrom: new Date(now - 2 * len).toISOString() };
}

/** Percentage change, one decimal. null when there is nothing to compare against. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const kpi = (value: number, previous: number) => ({ value, previous, changePct: changePct(value, previous) });

export const kpiDto = z
  .object({
    value: z.number(),
    previous: z.number().describe('Same measure for the previous window (or at the start of this window, for totals)'),
    changePct: z.number().nullable().describe('Signed % change; drives the green/red trend arrow. null = no baseline'),
  })
  .meta({ id: 'Kpi' });
