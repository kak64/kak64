import type {
  AiResponse,
  CalendarEvent,
  Expense,
  FamilyDocument,
  FamilyTask,
  FinancePortfolio,
  KidWallet,
  ShoppingItem,
  VaultPassword,
} from '../types';
import {
  MOCK_DOCUMENTS,
  MOCK_EVENTS,
  MOCK_EXPENSES,
  MOCK_FINANCE,
  MOCK_KIDS,
  MOCK_PASSWORDS,
  MOCK_SHOPPING,
  MOCK_TASKS,
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

  // ----- משימות -----
  getTasks: () => withFallback(() => request<FamilyTask[]>('/api/tasks'), MOCK_TASKS),
  addTask: (task: Omit<FamilyTask, 'id' | 'createdAt' | 'done'>) =>
    withFallback(
      () => request<FamilyTask>('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
      null,
    ),
  toggleTask: (id: string) =>
    withFallback(
      () => request<FamilyTask>(`/api/tasks/${id}/toggle`, { method: 'PATCH' }),
      null,
    ),

  // ----- הוצאות -----
  getExpenses: () => withFallback(() => request<Expense[]>('/api/expenses'), MOCK_EXPENSES),
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) =>
    withFallback(
      () => request<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(expense) }),
      null,
    ),

  // ----- ארנק ילדים -----
  getKids: () => withFallback(() => request<KidWallet[]>('/api/kids'), MOCK_KIDS),
  addKidSpend: (kidId: string, label: string, amount: number, category: string) =>
    withFallback(
      () =>
        request<KidWallet>(`/api/kids/${kidId}/spend`, {
          method: 'POST',
          body: JSON.stringify({ label, amount, category }),
        }),
      null,
    ),

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
