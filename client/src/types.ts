// ===== טיפוסים משותפים לאפליקציית +family =====

export type TabKey =
  | 'home'
  | 'shop'
  | 'calendar'
  | 'finance'
  | 'vault'
  | 'tasks'
  | 'kids'
  | 'expenses';

/** מחלקות סופר אפשריות */
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
  /** ISO date-time */
  start: string;
  end?: string;
  location?: string;
  /** אם האירוע סונכרן מ-Google Calendar */
  source: 'local' | 'google';
  color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

// ===== פיננסים =====
export type AssetKind = 'pension' | 'gemel' | 'insurance' | 'savings';

export interface FinancialAsset {
  id: string;
  kind: AssetKind;
  name: string;
  provider: string;
  balance: number;
  /** תשואה שנתית משוערת באחוזים */
  yieldPct?: number;
}

export interface FinancePortfolio {
  totalValue: number;
  estimatedYieldPct: number;
  assets: FinancialAsset[];
  /** האם הנתונים נמשכו בהצלחה מהמסלקה הפנסיונית */
  clearingHouseSynced: boolean;
  lastSyncedAt: string;
}

// ===== כספת מסמכים =====
export type DocumentType = 'id_card' | 'passport' | 'drivers_license' | 'other';

export interface FamilyDocument {
  id: string;
  type: DocumentType;
  title: string;
  owner: string;
  number?: string;
  /** ISO date — תאריך תפוגה */
  expiresAt: string;
}

export type ExpiryStatus = 'valid' | 'soon' | 'expired';

// ===== כספת סיסמאות =====
export interface VaultPassword {
  id: string;
  label: string;
  username: string;
  /** מוחזר מהשרת בלבד לצורך הדגמה; בפרודקשן מוצפן ב-AES-256 */
  password: string;
  url?: string;
}

// ===== עוזר AI =====
export type AiAction =
  | { type: 'add_shopping_item'; name: string; quantity: number; department: Department }
  | { type: 'query_document_expiry'; documentHint: string }
  | { type: 'query_finance' }
  | { type: 'unknown' };

export interface AiResponse {
  reply: string;
  action: AiAction;
}

// ===== בני משפחה =====
export type FamilyMember = 'אבא' | 'אמא' | 'משותף' | 'נועה' | 'יואב';

// ===== משימות (Todo) =====
export type TaskCategory = 'סידורים' | 'ילדים' | 'בית';

export interface FamilyTask {
  id: string;
  title: string;
  category: TaskCategory;
  assignee: FamilyMember;
  done: boolean;
  dueAt?: string; // ISO — אם קיים, נוצרת גם תזכורת ביומן
  createdAt: string;
}

// ===== מעקב הוצאות הורים =====
export type ExpenseCategory =
  | 'סופר/מזון'
  | 'חשבונות'
  | 'חינוך/חוגים'
  | 'פנאי'
  | 'רכב/תחבורה';

export type Payer = 'אבא' | 'אמא' | 'משותף';

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  payer: Payer;
  createdAt: string;
}

/** תקציב חודשי לכל קטגוריה (לחישוב פרוגרס-בר) */
export type BudgetMap = Record<ExpenseCategory, number>;

// ===== ארנק ילדים (Junior Wallet) =====
export type KidTxCategory = 'food' | 'movie' | 'games' | 'toys' | 'allowance' | 'other';

export interface KidTransaction {
  id: string;
  type: 'deposit' | 'spend';
  amount: number;
  label: string;
  category: KidTxCategory;
  createdAt: string;
}

export interface KidWallet {
  id: string;
  name: string;
  avatarColor: string;
  balance: number;
  monthlyAllowance: number;
  /** התאריך (ISO) של ההפקדה החודשית האחרונה — לבדיקת אוטומציה */
  lastAllowanceAt: string;
  transactions: KidTransaction[];
}

// ===== Quick Add — תוצאת ניתוח טקסט חופשי =====
export type QuickAddKind = 'shopping' | 'task' | 'expense';

export interface QuickAddParseResult {
  /** שם המוצר לקנייה (אם זוהתה כוונת קנייה) */
  shoppingName?: string;
  /** כותרת המשימה */
  taskTitle?: string;
  /** מועד יעד למשימה/תזכורת */
  dueAt?: string;
  /** תווית עברית קריאה של המועד (למשל: "מחר בבוקר") */
  dueLabel?: string;
  /** סכום ההוצאה */
  amount?: number;
  /** כותרת ההוצאה */
  expenseTitle?: string;
}
