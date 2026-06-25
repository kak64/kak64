import { isDbConnected } from './db.js';
import { ShoppingItemModel } from './models/ShoppingItem.js';
import { categorize } from './lib/categorize.js';
import {
  seedDocuments,
  seedEvents,
  seedExpenses,
  seedFinance,
  seedKids,
  seedPasswords,
  seedShopping,
  seedTasks,
  uid,
} from './data/seed.js';
import type {
  CalendarEvent,
  Expense,
  ExpenseCategory,
  FamilyDocument,
  FamilyMember,
  FamilyTask,
  FinancePortfolio,
  KidTransaction,
  KidTxCategory,
  KidWallet,
  Payer,
  ShoppingItem,
  TaskCategory,
  VaultPassword,
} from './types.js';

// ===== מאגר זיכרון (fallback / דמו) =====
const mem = {
  shopping: seedShopping(),
  events: seedEvents(),
  finance: seedFinance(),
  documents: seedDocuments(),
  passwords: seedPasswords(),
  tasks: seedTasks(),
  expenses: seedExpenses(),
  kids: seedKids(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toItem = (doc: any): ShoppingItem => ({
  id: String(doc._id ?? doc.id),
  name: doc.name,
  quantity: doc.quantity,
  department: doc.department,
  purchased: doc.purchased,
  createdAt: (doc.createdAt ?? new Date()).toString(),
});

export const store = {
  // ----- רשימת קניות (mutable, נתמך גם ב-Mongo) -----
  async getShopping(): Promise<ShoppingItem[]> {
    if (isDbConnected()) {
      const docs = await ShoppingItemModel.find().sort({ purchased: 1, createdAt: -1 }).lean();
      return docs.map(toItem);
    }
    return mem.shopping;
  },

  async addShopping(name: string, quantity = 1): Promise<ShoppingItem> {
    const department = categorize(name);
    if (isDbConnected()) {
      const created = await ShoppingItemModel.create({ name, quantity, department, purchased: false });
      return toItem(created.toObject());
    }
    const item: ShoppingItem = {
      id: uid('item'),
      name,
      quantity,
      department,
      purchased: false,
      createdAt: new Date().toISOString(),
    };
    mem.shopping.unshift(item);
    return item;
  },

  // ----- read-only (seed/דמו) -----
  getEvents: (): CalendarEvent[] => mem.events,
  getFinance: (): FinancePortfolio => mem.finance,
  getDocuments: (): FamilyDocument[] => mem.documents,
  getPasswords: (): VaultPassword[] => mem.passwords,

  // ----- משימות (in-memory) -----
  getTasks: (): FamilyTask[] => mem.tasks,
  addTask: (input: {
    title: string;
    category: TaskCategory;
    assignee: FamilyMember;
    dueAt?: string;
  }): FamilyTask => {
    const task: FamilyTask = {
      id: uid('tk'),
      title: input.title,
      category: input.category,
      assignee: input.assignee,
      done: false,
      dueAt: input.dueAt,
      createdAt: new Date().toISOString(),
    };
    mem.tasks.unshift(task);
    return task;
  },
  toggleTask: (id: string): FamilyTask | null => {
    const task = mem.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.done = !task.done;
    return task;
  },

  // ----- הוצאות (in-memory) -----
  getExpenses: (): Expense[] => mem.expenses,
  addExpense: (input: {
    title: string;
    amount: number;
    category: ExpenseCategory;
    payer: Payer;
  }): Expense => {
    const expense: Expense = { id: uid('ex'), createdAt: new Date().toISOString(), ...input };
    mem.expenses.unshift(expense);
    return expense;
  },

  // ----- ארנק ילדים (in-memory) -----
  getKids: (): KidWallet[] => mem.kids,
  kidSpend: (
    kidId: string,
    label: string,
    amount: number,
    category: KidTxCategory,
  ): KidWallet | null => {
    const kid = mem.kids.find((k) => k.id === kidId);
    if (!kid) return null;
    const tx: KidTransaction = {
      id: uid('ktx'),
      type: 'spend',
      amount,
      label,
      category,
      createdAt: new Date().toISOString(),
    };
    kid.balance = Math.max(0, kid.balance - amount);
    kid.transactions.push(tx);
    return kid;
  },
};
