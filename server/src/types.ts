export type Department =
  | 'מוצרי חלב'
  | 'ירקות ופירות'
  | 'בשר ודגים'
  | 'מאפים ולחם'
  | 'שימורים ויבשים'
  | 'קפואים'
  | 'משקאות'
  | 'ניקיון וטואלטיקה'
  | 'חטיפים ומתוקים'
  | 'כללי';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  department: Department;
  purchased: boolean;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  source: 'local' | 'google';
  color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

export type AssetKind = 'pension' | 'gemel' | 'insurance' | 'savings';

export interface FinancialAsset {
  id: string;
  kind: AssetKind;
  name: string;
  provider: string;
  balance: number;
  yieldPct?: number;
}

export interface FinancePortfolio {
  totalValue: number;
  estimatedYieldPct: number;
  assets: FinancialAsset[];
  clearingHouseSynced: boolean;
  lastSyncedAt: string;
}

export type DocumentType = 'id_card' | 'passport' | 'drivers_license' | 'other';

export interface FamilyDocument {
  id: string;
  type: DocumentType;
  title: string;
  owner: string;
  number?: string;
  expiresAt: string;
}

export interface VaultPassword {
  id: string;
  label: string;
  username: string;
  password: string;
  url?: string;
}

export type AiAction =
  | { type: 'add_shopping_item'; name: string; quantity: number; department: Department }
  | { type: 'query_document_expiry'; documentHint: string }
  | { type: 'query_finance' }
  | { type: 'unknown' };

export interface AiResponse {
  reply: string;
  action: AiAction;
}
