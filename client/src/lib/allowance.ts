import type { KidWallet } from '../types';

/**
 * אוטומציה חודשית: אם ההפקדה האחרונה התבצעה לפני ה-1 בחודש הנוכחי,
 * מפקידים את דמי הכיס ומעדכנים את התאריך. מדמה תהליך שירוץ בשרת ב-1 לכל חודש.
 * (תומך גם בכמה חודשים שחלפו — מפקיד עבור כל אחד.)
 */
export function applyMonthlyAllowance(kid: KidWallet, now = new Date()): KidWallet {
  const last = new Date(kid.lastAllowanceAt);
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (last >= firstOfThisMonth) return kid;

  // מספר החודשים שחלפו מאז ההפקדה האחרונה
  const months =
    (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
  if (months <= 0) return kid;

  const deposits = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      id: `auto_${d.getFullYear()}_${d.getMonth()}`,
      type: 'deposit' as const,
      amount: kid.monthlyAllowance,
      label: 'דמי כיס חודשיים',
      category: 'allowance' as const,
      createdAt: d.toISOString(),
    };
  }).reverse();

  return {
    ...kid,
    balance: kid.balance + kid.monthlyAllowance * months,
    lastAllowanceAt: firstOfThisMonth.toISOString(),
    transactions: [...kid.transactions, ...deposits],
  };
}
