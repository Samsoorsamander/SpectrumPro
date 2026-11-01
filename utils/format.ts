/** Shared money / date helpers used across lists and reports. */

export function formatAfn(value: number | null | undefined, digits = 0): string {
  const n = Number(value) || 0;
  return `AFN ${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function toDateKey(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar-day range using local YYYY-MM-DD strings. */
export function inDateRange(
  value: Date | string | null | undefined,
  startYmd: string,
  endYmd: string
): boolean {
  const key = toDateKey(value);
  if (!key) return false;
  if (startYmd && key < startYmd) return false;
  if (endYmd && key > endYmd) return false;
  return true;
}

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
