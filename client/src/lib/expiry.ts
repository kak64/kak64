import type { ExpiryStatus } from '../types';

export const EXPIRY_WARNING_DAYS = 90;

/** מספר הימים עד התפוגה (שלילי => כבר פג) */
export function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** מצב תוקף לפי סף של 90 יום */
export function expiryStatus(isoDate: string): ExpiryStatus {
  const days = daysUntil(isoDate);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'soon';
  return 'valid';
}

export function formatHebrewDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
