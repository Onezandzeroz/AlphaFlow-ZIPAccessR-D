/**
 * date-utils.ts
 *
 * Centralized date utilities for the application.
 *
 * IMPORTANT: This app stores DATE-ONLY values (no time-of-day) for transactions,
 * journal entries, invoices, etc. These are persisted by Prisma as UTC midnight
 * ISO strings (e.g. "2025-06-25T00:00:00.000Z").
 *
 * When comparing or displaying these dates, we must account for the timezone
 * offset between UTC midnight and the user's local midnight. For example, in
 * Copenhagen (UTC+2 summer), "2025-06-25T00:00:00.000Z" is 02:00 CEST.
 *
 * Failure to normalize leads to bugs like:
 *   - Relative time showing "12 timer siden" for a transaction dated today
 *   - Date sorting being off by one day near midnight
 *
 * Rules:
 *   - Use `toLocalDate()` to strip time and get the calendar date in local time.
 *   - Use `daysBetween()` for date-only comparisons (handles DST transitions).
 *   - Use `formatDate` from translations.ts for locale-aware display.
 *   - Use `getRelativeDate()` for human-readable relative time of date-only values.
 *   - Use `getRelativeTimestamp()` for human-readable relative time of real timestamps
 *     (e.g. audit log entries, createdAt).
 */

// ── Calendar date helpers ────────────────────────────────────────────

/**
 * Normalize a Date (or date string) to midnight LOCAL time.
 * Returns a new Date set to 00:00:00.000 in the user's timezone.
 *
 * This is the core building block for date-only comparisons.
 * Example: "2025-06-25T00:00:00.000Z" in CEST → June 25 00:00:00 CEST
 */
export function toLocalDate(value: Date | string): Date {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calculate the number of calendar days between two date-only values.
 * Uses Math.round() instead of Math.floor() to handle DST transitions
 * correctly (23h or 25h days).
 *
 * Returns a positive number if `b` is before `a`, negative if after.
 */
export function daysBetween(a: Date | string, b: Date | string): number {
  const aLocal = toLocalDate(a);
  const bLocal = toLocalDate(b);
  const diffMs = aLocal.getTime() - bLocal.getTime();
  return Math.round(diffMs / 86400000);
}

/**
 * Check if two date-only values represent the same calendar day.
 */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  return daysBetween(a, b) === 0;
}

/**
 * Check if a date-only value is today (in the user's local timezone).
 */
export function isToday(value: Date | string): boolean {
  return isSameDay(value, new Date());
}

// ── Relative time formatters ─────────────────────────────────────────

/**
 * Get a human-readable relative time string for a DATE-ONLY value.
 *
 * Use this for transactions, journal entries, invoices, etc.
 * where only the calendar date matters (no time-of-day).
 *
 * Examples (Danish):
 *   - "I dag", "I går", "2 dage siden", "1 uge siden", "25. jun 2025"
 *
 * Examples (English):
 *   - "Today", "Yesterday", "2d ago", "1w ago", "25 Jun 2025"
 */
export function getRelativeDate(dateStr: string, language: 'da' | 'en' = 'da'): string {
  const days = daysBetween(new Date(), dateStr);

  if (days === 0) return language === 'da' ? 'I dag' : 'Today';
  if (days === 1) return language === 'da' ? 'I går' : 'Yesterday';
  if (days < 0) return language === 'da' ? `I morgen` : 'Tomorrow';
  if (days < 7) return language === 'da' ? `${days} dage siden` : `${days}d ago`;

  const weeks = Math.ceil(days / 7);
  if (weeks < 4) return language === 'da' ? `${weeks} uge${weeks > 1 ? 'r' : ''} siden` : `${weeks}w ago`;

  // Fall back to locale-aware formatted date for older entries.
  const date = new Date(dateStr);
  const locale = language === 'da' ? 'da-DK' : 'en-GB';
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Get a human-readable relative time string for a TIMESTAMP value.
 *
 * Use this for audit logs, createdAt, updatedAt, and other real timestamps
 * where the time-of-day is meaningful.
 *
 * Examples (Danish):
 *   - "Lige nu", "5 min siden", "2 timer siden", "1 dag siden", "25. jun 2025"
 *
 * Examples (English):
 *   - "Just now", "5m ago", "2h ago", "1d ago", "25 Jun 2025"
 */
export function getRelativeTimestamp(isoStr: string, language: 'da' | 'en' = 'da'): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    // Future timestamp — show formatted date
    const locale = language === 'da' ? 'da-DK' : 'en-GB';
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (language === 'da') {
    if (diffMin < 1) return 'Lige nu';
    if (diffMin < 60) return `${diffMin} min siden`;
    if (diffHour < 24) return `${diffHour} time${diffHour > 1 ? 'r' : ''} siden`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} dag${diffDay > 1 ? 'e' : ''} siden`;
    return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  } else {
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}

// ── Server-side safe date formatting ────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD in LOCAL time (not UTC).
 *
 * Use this when constructing query parameters or date strings that
 * represent local calendar dates. DO NOT use date.toISOString() for
 * this purpose — it converts to UTC which shifts dates near midnight.
 *
 * Example: June 25 in Copenhagen (UTC+2) → "2025-06-25"
 *   date.toISOString().split('T')[0]  → "2025-06-24" (WRONG at 00:00-01:59 CEST)
 *   formatDateLocal(date)               → "2025-06-25" (CORRECT)
 */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
