import { parseHebrew } from './hebrewNlu.js';
import type { AiResponse } from '../types.js';

type Provider = 'rules' | 'anthropic' | 'openai' | 'gemini';

/**
 * פרומפט המערכת לעוזר ה-AI בעברית.
 * המודל מתבקש לנתח בקשה בעברית ולהחזיר JSON תקין בלבד התואם למבנה AiResponse:
 *   - להוספת מוצר: action.type = "add_shopping_item" עם name, quantity, department
 *   - לשאלת תוקף מסמך: action.type = "query_document_expiry" עם documentHint
 *   - לשאלה פיננסית: action.type = "query_finance"
 *   - אחרת: action.type = "unknown"
 */
export function buildSystemPrompt(): string {
  return [
    'אתה עוזר משפחתי חכם בעברית עבור אפליקציית +family.',
    'נתח את בקשת המשתמש והחזר JSON תקין בלבד (ללא טקסט נוסף) במבנה:',
    '{ "reply": "<תשובה קצרה וידידותית בעברית>", "action": { ... } }',
    'אפשרויות ל-action:',
    '1) הוספת מוצר לרשימת קניות: {"type":"add_shopping_item","name":"<שם המוצר>","quantity":<מספר>,"department":"<מחלקה>"}.',
    '   מחלקות אפשריות: "מוצרי חלב","ירקות ופירות","בשר ודגים","מאפים ולחם","שימורים ויבשים","קפואים","משקאות","ניקיון וטואלטיקה","חטיפים ומתוקים","כללי".',
    '2) שאלה על תוקף מסמך: {"type":"query_document_expiry","documentHint":"<דרכון|תעודת זהות|רישיון נהיגה>"}.',
    '3) שאלה פיננסית: {"type":"query_finance"}.',
    '4) אחרת: {"type":"unknown"}.',
    'דוגמה: קלט "תוסיף חלב לרשימה" => {"reply":"הוספתי חלב לרשימה","action":{"type":"add_shopping_item","name":"חלב","quantity":1,"department":"מוצרי חלב"}}',
  ].join('\n');
}

function safeParse(raw: string): AiResponse | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    if (obj && typeof obj.reply === 'string' && obj.action && typeof obj.action.type === 'string') {
      return obj as AiResponse;
    }
    return null;
  } catch {
    return null;
  }
}

async function callAnthropic(text: string, model: string): Promise<AiResponse | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { text?: string }[] };
  return safeParse(data.content?.[0]?.text ?? '');
}

async function callOpenAi(text: string, model: string): Promise<AiResponse | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return safeParse(data.choices?.[0]?.message?.content ?? '');
}

async function callGemini(text: string, model: string): Promise<AiResponse | null> {
  const key = process.env.GEMINI_API_KEY ?? '';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text }] }],
      }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return safeParse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
}

/**
 * נקודת הכניסה: מנתב לפי AI_PROVIDER. בכל כשל (אין מפתח / שגיאת רשת / JSON לא תקין)
 * נופלים חזרה למנוע החוקים העברי כך שהנתיב תמיד מחזיר תשובה תקפה.
 */
export async function ask(text: string): Promise<AiResponse> {
  const provider = (process.env.AI_PROVIDER as Provider) || 'rules';
  const model = process.env.AI_MODEL || 'claude-sonnet-4-6';

  try {
    let result: AiResponse | null = null;
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) result = await callAnthropic(text, model);
    else if (provider === 'openai' && process.env.OPENAI_API_KEY) result = await callOpenAi(text, model);
    else if (provider === 'gemini' && process.env.GEMINI_API_KEY) result = await callGemini(text, model);
    if (result) return result;
  } catch (err) {
    console.warn('⚠️  עוזר ה-AI נכשל, נופלים למנוע החוקים:', (err as Error).message);
  }

  return parseHebrew(text);
}
