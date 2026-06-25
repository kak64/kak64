import { isDbConnected } from './db.js';
import { ShoppingItemModel } from './models/ShoppingItem.js';
import { categorize } from './lib/categorize.js';
import {
  seedDocuments,
  seedEvents,
  seedFinance,
  seedPasswords,
  seedShopping,
  uid,
} from './data/seed.js';
import type {
  CalendarEvent,
  FamilyDocument,
  FinancePortfolio,
  ShoppingItem,
  VaultPassword,
} from './types.js';

// ===== מאגר זיכרון (fallback / דמו) =====
const mem = {
  shopping: seedShopping(),
  events: seedEvents(),
  finance: seedFinance(),
  documents: seedDocuments(),
  passwords: seedPasswords(),
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
};
