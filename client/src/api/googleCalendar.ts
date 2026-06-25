import type { CalendarEvent } from '../types';

/**
 * פונקציות Mock להכנה לאינטגרציה עתידית מול Google Calendar API.
 * כרגע מחזירות הבטחות מדומות; בעתיד יוחלפו בקריאות OAuth2 אמיתיות.
 *
 * תיעוד עתידי: https://developers.google.com/calendar/api
 */

export interface GoogleSyncResult {
  imported: CalendarEvent[];
  syncedAt: string;
}

/** מדמה התחברות OAuth2 לחשבון Google */
export async function connectGoogleCalendar(): Promise<{ connected: boolean }> {
  // TODO: לממש זרימת OAuth2 אמיתית (gapi / google-auth-library)
  return Promise.resolve({ connected: true });
}

/** מדמה משיכת אירועים מ-Google Calendar */
export async function fetchGoogleEvents(): Promise<GoogleSyncResult> {
  // TODO: GET https://www.googleapis.com/calendar/v3/calendars/primary/events
  return Promise.resolve({ imported: [], syncedAt: new Date().toISOString() });
}

/** מדמה דחיפת אירוע מקומי ל-Google Calendar */
export async function pushEventToGoogle(event: CalendarEvent): Promise<{ ok: boolean; remoteId: string }> {
  // TODO: POST https://www.googleapis.com/calendar/v3/calendars/primary/events
  return Promise.resolve({ ok: true, remoteId: `g_${event.id}` });
}
