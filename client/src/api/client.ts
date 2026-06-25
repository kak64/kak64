import type {
  AiResponse,
  CalendarEvent,
  FamilyDocument,
  FinancePortfolio,
  ShoppingItem,
  VaultPassword,
} from '../types';
import {
  MOCK_DOCUMENTS,
  MOCK_EVENTS,
  MOCK_FINANCE,
  MOCK_PASSWORDS,
  MOCK_SHOPPING,
} from '../data/mock';
import { localAiAnswer } from './localAi';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return (await res.json()) as T;
}

/**
 * עוטף קריאת API: אם השרת לא זמין (פיתוח standalone) נופלים בחן לנתוני דמה מקומיים.
 */
async function withFallback<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  if (!API_URL) return fallback;
  try {
    return await call();
  } catch {
    return fallback;
  }
}

export const api = {
  // ----- רשימת קניות -----
  getShoppingList: () =>
    withFallback(() => request<ShoppingItem[]>('/api/shopping-list'), MOCK_SHOPPING),

  addShoppingItem: (name: string, quantity = 1) =>
    withFallback(
      () =>
        request<ShoppingItem>('/api/shopping-list', {
          method: 'POST',
          body: JSON.stringify({ name, quantity }),
        }),
      null,
    ),

  // ----- יומן -----
  getEvents: () => withFallback(() => request<CalendarEvent[]>('/api/calendar'), MOCK_EVENTS),

  // ----- פיננסים -----
  getFinance: () => withFallback(() => request<FinancePortfolio>('/api/finance'), MOCK_FINANCE),

  // ----- כספת -----
  getDocuments: () => withFallback(() => request<FamilyDocument[]>('/api/documents'), MOCK_DOCUMENTS),
  getPasswords: () => withFallback(() => request<VaultPassword[]>('/api/passwords'), MOCK_PASSWORDS),

  // ----- עוזר AI -----
  askAi: (text: string) =>
    withFallback(
      () =>
        request<AiResponse>('/api/ai/ask', {
          method: 'POST',
          body: JSON.stringify({ text }),
        }),
      localAiAnswer(text),
    ),
};
