// BuildCheck Portal — SPA controller.
// Three panels over one strict core: app admin (companies + branding +
// registries), company manager (workers, dispatch, report review) and
// worker (date-filtered tasks, photo-mandatory checks, cm/m measurements).

import { todayStr, addDaysStr, defaultCtx } from '/core/util.js';
import { roleById, districtById, areaById, categoryById, subcategoryById, addRole, addCategory, addSubcategory } from '/core/directory.js';
import { generateLogo } from '/core/logo.js';
import {
  authenticate, companyOf, createCompany, createManager, createWorker, setUserActive, regenerateLogo,
  renameUser, resetPassword, changeUsername, deleteUser, usernameAvailable, normalizeUsername,
  setCompanyLogoImage, clearCompanyLogoImage, canManageFully, canResetCredentials, SUPERVISORY_ROLES,
} from '/core/auth.js';
import {
  STATUS, STATUS_LABELS, MEASUREMENT_UNITS, resolveAssignees, dispatchTask,
  tasksForWorker, getAssignment, startAssignment, saveDraft, emptyDraftItem,
  submitReport, approveAssignment, resolveDefect, isOverdue, companyTasks, companyStats,
  companyFines, finesSummary,
} from '/core/tasks.js';
import { createDb, seedDemo, serializeDb, deserializeDb } from '/core/store.js';
import { askAssistant, assistantIntro } from '/core/knowledge.js';
import { analyzePixels, buildScanReport, guessProjectName, buildProgram, dispatchProgram } from '/core/planstudio.js';
import { extractDocxText, extractPdfText } from '/core/docparse.js';
import { reviewDocument } from '/core/docreview.js';
import { reportTrend, defectsByCategory, collectDefects, riskScore } from '/core/analytics.js';
import { buildDefectsCsv, buildFinesCsv, buildReportHtml, buildCertificateHtml } from '/core/reports.js';

const STORAGE_KEY = 'buildcheck-portal-db-v1';
const SESSION_KEY = 'buildcheck-portal-session-v1';
const ctx = defaultCtx();

const APP_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 96 96" role="img" aria-label="BuildCheck">
  <rect width="96" height="96" rx="20" fill="#1e56a0"/>
  <g opacity="0.25" stroke="#eaf1fa" stroke-width="2.5"><path d="M24 0V96 M48 0V96 M72 0V96 M0 24H96 M0 48H96 M0 72H96"/></g>
  <path d="M26 52 L42 68 L72 32" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

let db;
let currentUser = null;
const ui = {
  tab: null,
  loginError: '',
  dispatch: null,
  openTask: null,
  reportView: null,
  execTask: null,
  myTasksMode: 'today',
  myTasksDate: todayStr(),
  modal: null,
  lightbox: null,
  assistantOpen: false,
  assistantLog: [],
  studio: null,
  resolve: null,
  sigModal: null,
  userEdit: null,
};

// ---------------------------------------------------------------------------
// Persistence & boot
// ---------------------------------------------------------------------------

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDb(db));
  } catch (e) {
    toast('שגיאת שמירה מקומית: ' + e.message, true);
  }
}

function boot() {
  db = deserializeDb(localStorage.getItem(STORAGE_KEY) ?? '');
  if (!db) {
    db = createDb(ctx);
    seedDemo(db, ctx);
    persist();
  }
  const sessionId = localStorage.getItem(SESSION_KEY);
  currentUser = db.users.find((u) => u.id === sessionId && u.active) ?? null;
  if (currentUser) ui.tab = defaultTab(currentUser);
  render();
}

function defaultTab(user) {
  return { appadmin: 'companies', manager: 'overview', worker: 'mytasks' }[user.kind];
}

function login(user) {
  currentUser = user;
  localStorage.setItem(SESSION_KEY, user.id);
  ui.tab = defaultTab(user);
  ui.loginError = '';
  render();
}

function logout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  Object.assign(ui, { tab: null, dispatch: null, openTask: null, reportView: null, execTask: null, modal: null });
  render();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const app = document.getElementById('app');

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node[key] = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && key !== 'type' && key !== 'value') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  if ('value' in attrs && attrs.value != null) node.value = attrs.value;
  if ('type' in attrs) node.setAttribute('type', attrs.type);
  return node;
}

function toast(message, isError = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const node = el('div', { class: 'toast' + (isError ? ' error' : ''), text: message });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), isError ? 4200 : 2200);
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function logoNode(company, size = 40) {
  const span = el('span', { class: 'co-logo', style: `width:${size}px;height:${size}px` });
  if (company.logoImage) {
    span.appendChild(el('img', { src: company.logoImage, alt: company.name, width: size, height: size }));
  } else {
    span.innerHTML = generateLogo(company.logoSeed, company.name, size);
  }
  return span;
}

function statusChip(task, assignment) {
  const overdue = isOverdue(task, assignment, todayStr());
  if (overdue) return el('span', { class: 'chip overdue', text: 'באיחור ⏰' });
  return el('span', { class: `chip ${assignment.status}`, text: STATUS_LABELS[assignment.status] });
}

function catLabel(task) {
  const cat = categoryById(db, task.categoryId);
  const sub = subcategoryById(db, task.categoryId, task.subcategoryId);
  return `${cat?.icon ?? ''} ${cat?.name ?? ''} · ${sub?.name ?? ''}`;
}

function userName(id) {
  return db.users.find((u) => u.id === id)?.name ?? '—';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Minimal, safe inline markdown: escape everything, then bold **…**. */
function mdLite(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function tryAction(fn) {
  try {
    fn();
    persist();
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------------------
// Root render
// ---------------------------------------------------------------------------

function render() {
  if (!currentUser) {
    renderLogin();
  } else {
    renderShell();
  }
  renderOverlays();
}

function renderOverlays() {
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  if (ui.lightbox) {
    const overlay = el('div', { class: 'overlay', onclick: () => { ui.lightbox = null; render(); } },
      el('img', { class: 'lb', src: ui.lightbox, alt: 'תמונה מוגדלת' }));
    document.body.appendChild(overlay);
  }
  renderSignatureOverlay();
  renderUserEditOverlay();
  if (ui.modal) {
    const m = ui.modal;
    const overlay = el('div', { class: 'overlay' },
      el('div', { class: 'modal', onclick: (e) => e.stopPropagation() },
        el('h3', { text: m.title }),
        el('div', { text: `נפתח חשבון עבור ${m.name}. אלו פרטי ההתחברות — שמור אותם, הסיסמה מוצגת פעם אחת:` }),
        el('div', { class: 'cred-box' },
          el('span', { class: 'k', text: 'שם משתמש' }), el('span', { class: 'v', text: m.username }),
          el('span', { class: 'k', text: 'סיסמה' }), el('span', { class: 'v', text: m.password })),
        el('div', { class: 'btn-row' },
          el('button', {
            class: 'btn secondary small',
            text: 'העתק פרטים',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(`שם משתמש: ${m.username}\nסיסמה: ${m.password}`);
                toast('הפרטים הועתקו');
              } catch {
                toast('ההעתקה נחסמה — רשום ידנית', true);
              }
            },
          }),
          el('button', { class: 'btn small', text: 'סגור', onclick: () => { ui.modal = null; render(); } }))));
    document.body.appendChild(overlay);
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function renderLogin() {
  const hint = el('div', { id: 'company-hint' });

  const updateHint = (value) => {
    hint.innerHTML = '';
    const u = db.users.find((x) => x.username === value.trim().toLowerCase());
    const company = u ? companyOf(db, u) : null;
    if (company) {
      const wrap = el('span', { class: 'company-hint' });
      wrap.appendChild(logoNode(company, 26));
      wrap.appendChild(el('span', { text: `פאנל של ${company.name}` }));
      hint.appendChild(wrap);
    } else if (u?.kind === 'appadmin') {
      hint.appendChild(el('span', { class: 'company-hint', text: '🛠️ ניהול האפליקציה' }));
    }
  };

  const userInput = el('input', { type: 'text', id: 'login-user', placeholder: 'למשל: ohad', autocomplete: 'username', oninput: (e) => updateHint(e.target.value) });
  const passInput = el('input', { type: 'password', id: 'login-pass', placeholder: '••••', autocomplete: 'current-password' });

  const doLogin = () => {
    const user = authenticate(db, userInput.value, passInput.value);
    if (!user) {
      ui.loginError = 'שם משתמש או סיסמה שגויים, או שהחשבון הושבת';
      render();
      return;
    }
    login(user);
  };
  passInput.onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  userInput.onkeydown = (e) => { if (e.key === 'Enter') passInput.focus(); };

  const demoChip = (label, username) => el('button', {
    class: 'demo-chip',
    text: label,
    onclick: () => {
      userInput.value = username;
      passInput.value = '1234';
      updateHint(username);
      doLogin();
    },
  });

  const card = el('div', { class: 'login-card' },
    el('div', { class: 'login-mark' },
      el('span', { html: APP_MARK }),
      el('div', { class: 't', html: 'BuildCheck Portal<small>ניהול עבודות ובקרת שטח</small>' })),
    ui.loginError ? el('div', { class: 'login-error', text: ui.loginError }) : null,
    el('div', { class: 'field' }, el('label', { text: 'שם משתמש' }), userInput),
    el('div', { class: 'field' }, el('label', { text: 'סיסמה' }), passInput),
    el('button', { class: 'btn', text: 'כניסה לפאנל', onclick: doLogin }),
    el('div', { class: 'demo-box' },
      el('div', { class: 'cap', text: 'חשבונות דמו — כניסה בלחיצה:' }),
      el('div', { class: 'demo-chips' },
        demoChip('🛠️ מנהל האפליקציה', 'admin'),
        demoChip('🏢 מנהל חברה — אוהד', 'ohad'),
        demoChip('👷 עובד — יוסי (אינסטלטור)', 'yossi'))));

  const brandbar = el('div', { class: 'login-brandbar' },
    hint,
    el('div', { class: 'logos' }, db.companies.map((c) => logoNode(c, 30))),
    el('div', { text: 'החברות שמקבלות שירות · מופעל על ידי BuildCheck AI' }));

  app.replaceChildren(el('div', { class: 'login-wrap' }, card, brandbar));
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const TABS = {
  appadmin: [
    { id: 'companies', label: 'חברות ולוגו' },
    { id: 'registry', label: 'קטגוריות ותפקידים' },
    { id: 'settings', label: 'הגדרות' },
  ],
  manager: [
    { id: 'overview', label: 'סקירה' },
    { id: 'dashboard', label: 'דשבורד' },
    { id: 'studio', label: 'סטודיו תוכניות' },
    { id: 'dispatch', label: 'שליחת משימה' },
    { id: 'tasks', label: 'משימות ודוחות' },
    { id: 'workers', label: 'עובדים' },
    { id: 'company', label: 'החברה שלי' },
  ],
  worker: [
    { id: 'mytasks', label: 'המשימות שלי' },
    { id: 'history', label: 'דוחות שנשלחו' },
  ],
};

function renderShell() {
  const company = companyOf(db, currentUser);
  const roleLabel = currentUser.kind === 'appadmin' ? 'מנהל האפליקציה'
    : currentUser.kind === 'manager' ? 'מנהל חברה'
    : roleById(db, currentUser.roleId)?.name ?? 'עובד';

  const brand = company
    ? el('div', { class: 'co' }, logoNode(company, 40),
        el('div', { class: 'n' }, company.name, el('span', { class: 'sub', text: 'BuildCheck Portal' })))
    : el('div', { class: 'co' }, el('span', { html: APP_MARK }),
        el('div', { class: 'n' }, 'BuildCheck Portal', el('span', { class: 'sub', text: 'ניהול האפליקציה' })));

  const topbar = el('header', { class: 'topbar' },
    brand,
    el('div', { class: 'spacer' }),
    el('span', { class: 'userchip' },
      el('span', { class: 'name-full' }, el('b', { text: currentUser.name }), ` · ${roleLabel}`)),
    el('button', { class: 'btn-ghost', text: 'יציאה', onclick: logout }));

  const tabs = el('nav', { class: 'navtabs' },
    TABS[currentUser.kind].map((t) => el('button', {
      class: 'navtab' + (ui.tab === t.id ? ' active' : ''),
      text: t.label,
      onclick: () => {
        ui.tab = t.id;
        ui.openTask = null; ui.reportView = null; ui.execTask = null;
        if (t.id === 'dispatch') ui.dispatch = null;
        render();
      },
    })));

  const content = el('main', { class: 'content' });
  if (currentUser.kind === 'appadmin') renderAdmin(content);
  else if (currentUser.kind === 'manager') renderManager(content);
  else renderWorker(content);

  app.replaceChildren(topbar, tabs, content, assistantFab());
  if (ui.assistantOpen) app.appendChild(assistantPanel());
}

// ===========================================================================
// App admin panel
// ===========================================================================

function renderAdmin(content) {
  if (ui.tab === 'companies') return renderAdminCompanies(content);
  if (ui.tab === 'registry') return renderAdminRegistry(content);
  return renderAdminSettings(content);
}

function renderAdminCompanies(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'חברות בשירות' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'כל חברה מקבלת מיתוג ייחודי: העלה לוגו משלך (תמונה), או הגרל מארק גיאומטרי.' }));

  for (const company of db.companies) {
    const managers = db.users.filter((u) => u.kind === 'manager' && u.companyId === company.id);
    const workers = db.users.filter((u) => u.kind === 'worker' && u.companyId === company.id);
    content.appendChild(el('div', { class: 'card task-card' },
      el('div', { class: 'head' },
        logoNode(company, 52),
        el('span', { class: 't', text: company.name }),
        el('span', { class: 'chip cat num', text: `${managers.length} מנהלים · ${workers.length} עובדים` })),
      el('div', { class: 'meta' },
        el('span', {}, 'מנהלים: ', managers.map((m) => m.name).join(', ') || '—')),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn accent small', text: '🖼️ העלה לוגו',
          onclick: () => uploadLogoFlow(company),
        }),
        company.logoImage ? el('button', {
          class: 'btn secondary small', text: 'הסר לוגו',
          onclick: () => tryAction(() => { clearCompanyLogoImage(db, currentUser, company.id); toast('הלוגו הוסר'); }),
        }) : null,
        el('button', {
          class: 'btn secondary small', text: '🎲 הגרל מארק',
          onclick: () => tryAction(() => { regenerateLogo(db, currentUser, company.id, ctx); toast('מארק חדש הוגרל'); }),
        }),
        el('button', {
          class: 'btn secondary small', text: '+ מנהל חברה',
          onclick: () => {
            const name = window.prompt('שם המנהל החדש:')?.trim();
            if (!name) return;
            tryAction(() => {
              const { credentials } = createManager(db, currentUser, { companyId: company.id, name }, ctx);
              ui.modal = { title: 'מנהל חברה נוצר', name, ...credentials };
            });
          },
        }))));
  }

  const nameInput = el('input', { type: 'text', id: 'new-co-name', placeholder: 'למשל: גל-ים הנדסה בע"מ' });
  const managerInput = el('input', { type: 'text', id: 'new-co-manager', placeholder: 'למשל: רון אברהם' });
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'פתיחת חברה חדשה' }),
    el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { text: 'שם החברה' }), nameInput),
      el('div', { class: 'field' }, el('label', { text: 'שם מנהל החברה' }), managerInput)),
    el('div', { class: 'btn-row', style: 'margin-top:0.7rem' },
      el('button', {
        class: 'btn', text: 'פתח חברה + מנהל',
        onclick: () => tryAction(() => {
          const company = createCompany(db, currentUser, { name: nameInput.value }, ctx);
          const { credentials } = createManager(db, currentUser, { companyId: company.id, name: managerInput.value }, ctx);
          ui.modal = { title: `החברה "${company.name}" נפתחה`, name: managerInput.value.trim(), ...credentials };
        }),
      }))));
}

function renderAdminRegistry(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'קטגוריות משימות' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'קטגוריות מחולקות לתתי-קטגוריות; לכל תת-קטגוריה בדיקות ברירת מחדל שנשלחות לעובד.' }));

  for (const cat of db.categories) {
    const subName = el('input', { type: 'text', placeholder: 'שם תת-קטגוריה' });
    const subChecks = el('input', { type: 'text', placeholder: 'בדיקות מופרדות בפסיק' });
    content.appendChild(el('div', { class: 'card' },
      el('h3', { text: `${cat.icon} ${cat.name}` }),
      el('div', { class: 'workers-preview' },
        cat.subs.map((s) => el('span', { class: 'chip cat', title: s.checks.join(' · '), text: `${s.name} (${s.checks.length})` }))),
      el('div', { class: 'form-grid', style: 'margin-top:0.7rem' },
        el('div', { class: 'field' }, el('label', { text: 'תת-קטגוריה חדשה' }), subName),
        el('div', { class: 'field' }, el('label', { text: 'בדיקות (מופרד בפסיק)' }), subChecks)),
      el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
        el('button', {
          class: 'btn secondary small', text: '+ הוסף תת-קטגוריה',
          onclick: () => tryAction(() => {
            addSubcategory(db, currentUser, cat.id, { name: subName.value, checks: subChecks.value.split(',') });
            toast('תת-קטגוריה נוספה');
          }),
        }))));
  }

  const catName = el('input', { type: 'text', placeholder: 'למשל: פיתוח חוץ' });
  const catIcon = el('input', { type: 'text', placeholder: 'אימוג׳י, למשל 🌳', value: '📋' });
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'קטגוריה חדשה' }),
    el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { text: 'שם' }), catName),
      el('div', { class: 'field' }, el('label', { text: 'סמל' }), catIcon)),
    el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
      el('button', {
        class: 'btn small', text: '+ הוסף קטגוריה',
        onclick: () => tryAction(() => { addCategory(db, currentUser, { name: catName.value, icon: catIcon.value || '📋' }); toast('קטגוריה נוספה'); }),
      }))));

  const roleName = el('input', { type: 'text', placeholder: 'למשל: מסגר' });
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'תפקידים רשומים באפליקציה' }),
    el('div', { class: 'workers-preview' }, db.roles.map((r) => el('span', { class: 'chip cat', text: r.name }))),
    el('div', { class: 'form-grid', style: 'margin-top:0.7rem' },
      el('div', { class: 'field' }, el('label', { text: 'תפקיד חדש' }), roleName)),
    el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
      el('button', {
        class: 'btn small', text: '+ הוסף תפקיד',
        onclick: () => tryAction(() => { addRole(db, currentUser, { name: roleName.value }); toast('תפקיד נוסף'); }),
      }))));
}

function renderAdminSettings(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'הגדרות' }));
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'נתוני דמו' }),
    el('p', { style: 'font-size:0.87rem;color:var(--muted)', text: 'הנתונים נשמרים מקומית בדפדפן זה בלבד. איפוס מוחק את כל השינויים ומחזיר את נתוני הדמו המקוריים.' }),
    el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn danger small', text: 'אפס נתוני דמו',
        onclick: () => {
          if (!window.confirm('לאפס את כל הנתונים ולחזור לדמו המקורי?')) return;
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(SESSION_KEY);
          location.reload();
        },
      }))));
}

// ===========================================================================
// Manager panel
// ===========================================================================

function renderManager(content) {
  if (ui.reportView) return renderReportView(content, { manager: true });
  if (ui.tab === 'overview') return renderManagerOverview(content);
  if (ui.tab === 'dashboard') return renderManagerDashboard(content);
  if (ui.tab === 'studio') return renderManagerStudio(content);
  if (ui.tab === 'dispatch') return renderManagerDispatch(content);
  if (ui.tab === 'tasks') return renderManagerTasks(content);
  if (ui.tab === 'company') return renderManagerCompany(content);
  return renderManagerWorkers(content);
}

function renderManagerCompany(content) {
  const company = companyOf(db, currentUser);
  content.appendChild(el('h2', { class: 'page-title', text: 'החברה שלי' }));

  // Branding.
  content.appendChild(el('div', { class: 'card task-card' },
    el('div', { class: 'head' }, logoNode(company, 56), el('span', { class: 't', text: company.name })),
    el('p', { class: 'muted-note', text: 'העלה לוגו משלך (תמונה) כדי למתג את הפאנל והדוחות, או הגרל מארק גיאומטרי.' }),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn accent small', text: '🖼️ העלה לוגו', onclick: () => uploadLogoFlow(company) }),
      company.logoImage ? el('button', { class: 'btn secondary small', text: 'הסר לוגו', onclick: () => tryAction(() => { clearCompanyLogoImage(db, currentUser, company.id); toast('הלוגו הוסר'); }) }) : null,
      el('button', { class: 'btn secondary small', text: '🎲 הגרל מארק', onclick: () => tryAction(() => { regenerateLogo(db, currentUser, company.id, ctx); toast('מארק חדש הוגרל'); }) }))));

  // Fines ledger.
  const fines = companyFines(db, currentUser.companyId);
  const sum = finesSummary(db, currentUser.companyId);
  const card = el('div', { class: 'card' },
    el('h3', { text: `💸 קנסות (${sum.count})` }),
    el('div', { class: 'stat-row', style: 'margin-bottom:0.7rem' },
      stat(`₪${sum.openAmount.toLocaleString()}`, 'קנסות פתוחים'),
      stat(`₪${sum.totalAmount.toLocaleString()}`, 'סה"כ קנסות'),
      stat(sum.openCount, 'מספר פתוחים')));
  if (fines.length === 0) {
    card.appendChild(el('div', { class: 'empty', text: 'לא נרשמו קנסות 🎉' }));
  } else {
    for (const f of fines) {
      card.appendChild(el('div', { class: 'assignee-row' },
        el('span', { class: 'chip ' + (f.status === 'open' ? 'rejected' : 'approved'), text: f.status === 'open' ? 'פתוח' : 'שולם' }),
        el('b', { class: 'num', text: `₪${f.amount.toLocaleString()}` }),
        el('span', { class: 'grow', text: `${f.taskTitle} — ${userName(f.workerId)}` }),
        f.reason ? el('span', { class: 'muted-note', text: f.reason }) : null,
        f.status === 'open' ? el('button', { class: 'btn secondary small', text: 'סמן כשולם', onclick: () => tryAction(() => { f.status = 'paid'; toast('סומן כשולם'); }) }) : null));
    }
    card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:0.7rem' },
      el('button', { class: 'btn secondary small', text: '💸 ייצוא ל-Excel', onclick: exportFinesCsv })));
  }
  content.appendChild(card);
}

function renderManagerOverview(content) {
  const stats = companyStats(db, currentUser.companyId, todayStr());
  content.appendChild(el('h2', { class: 'page-title', text: `שלום ${currentUser.name.split(' ')[0]} 👋` }));
  content.appendChild(el('div', { class: 'stat-row' },
    stat(stats.total, 'סה"כ שיוכים'),
    stat(stats.pending, 'ממתינים'),
    stat(stats.in_progress, 'בביצוע'),
    stat(stats.submitted, 'דוחות לאישור'),
    stat(stats.approved, 'אושרו'),
    el('div', { class: 'stat overdue' }, el('div', { class: 'v', text: stats.overdue }), el('div', { class: 'l', text: 'באיחור' }))));

  const awaiting = [];
  for (const task of companyTasks(db, currentUser.companyId)) {
    for (const a of task.assignments) {
      if (a.status === STATUS.SUBMITTED) awaiting.push({ task, a });
    }
  }
  const card = el('div', { class: 'card' }, el('h3', { text: `דוחות ממתינים לאישור (${awaiting.length})` }));
  if (awaiting.length === 0) {
    card.appendChild(el('div', { class: 'empty', text: 'אין דוחות שממתינים לאישור 🎉' }));
  }
  for (const { task, a } of awaiting) {
    card.appendChild(el('div', { class: 'assignee-row' },
      el('span', {}, el('b', { text: userName(a.workerId) }), ` — ${task.title}`),
      el('span', { class: 'grow' }),
      a.report?.items.some((i) => i.status === 'defect') ? el('span', { class: 'chip defect', text: 'כולל ליקויים' }) : null,
      el('button', {
        class: 'btn small', text: 'צפה בדוח',
        onclick: () => { ui.reportView = { taskId: task.id, workerId: a.workerId }; render(); },
      })));
  }
  content.appendChild(card);
}

function stat(value, label) {
  return el('div', { class: 'stat' }, el('div', { class: 'v', text: value }), el('div', { class: 'l', text: label }));
}

function renderManagerDispatch(content) {
  if (!ui.dispatch) {
    ui.dispatch = {
      categoryId: db.categories[0].id,
      subcategoryId: db.categories[0].subs[0].id,
      checksText: db.categories[0].subs[0].checks.join('\n'),
      roleId: '', districtId: '', areaId: '',
      title: '', site: '', description: '',
      execDate: todayStr(), execTime: '08:00', dueDate: addDaysStr(todayStr(), 2),
    };
  }
  const d = ui.dispatch;
  const cat = categoryById(db, d.categoryId);

  content.appendChild(el('h2', { class: 'page-title', text: 'שליחת משימה לעובדים' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'בחר קטגוריה, כוון את היעד לפי מחוז / אזור / תפקיד, וקבע מועד ביצוע ותאריך יעד.' }));

  const catSelect = select(cat.id, db.categories.map((c) => [c.id, `${c.icon} ${c.name}`]), (v) => {
    d.categoryId = v;
    d.subcategoryId = categoryById(db, v).subs[0].id;
    d.checksText = categoryById(db, v).subs[0].checks.join('\n');
    render();
  });
  const subSelect = select(d.subcategoryId, cat.subs.map((s) => [s.id, s.name]), (v) => {
    d.subcategoryId = v;
    d.checksText = subcategoryById(db, d.categoryId, v).checks.join('\n');
    render();
  });

  const checksArea = el('textarea', { rows: 4, value: d.checksText, oninput: (e) => { d.checksText = e.target.value; } });

  const roleSelect = select(d.roleId, [['', 'כל התפקידים'], ...db.roles.map((r) => [r.id, r.name])], (v) => { d.roleId = v; render(); });
  const districtSelect = select(d.districtId, [['', 'כל המחוזות'], ...db.districts.map((x) => [x.id, x.name])], (v) => { d.districtId = v; d.areaId = ''; render(); });
  const areas = d.districtId ? districtById(db, d.districtId).areas : [];
  const areaSelect = select(d.areaId, [['', 'כל האזורים'], ...areas.map((a) => [a.id, a.name])], (v) => { d.areaId = v; render(); });
  if (!d.districtId) areaSelect.disabled = true;

  const target = {
    roleId: d.roleId || undefined,
    districtId: d.districtId || undefined,
    areaId: d.areaId || undefined,
  };
  const matched = resolveAssignees(db, currentUser.companyId, target);

  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: '1 · מה מבצעים' }),
    el('div', { class: 'form-grid' },
      field('קטגוריה', catSelect),
      field('תת-קטגוריה', subSelect),
      field('כותרת המשימה', input('text', d.title, (v) => { d.title = v; }, 'למשל: קומפלטים בניין B קומה 2')),
      field('אתר / פרויקט', input('text', d.site, (v) => { d.site = v; }, 'למשל: מגדלי הים, חיפה')),
      el('div', { class: 'field wide' }, el('label', { text: 'בדיקות במשימה (שורה לכל בדיקה — נטען אוטומטית מהתת-קטגוריה)' }), checksArea),
      el('div', { class: 'field wide' }, el('label', { text: 'הערות לעובד (רשות)' }),
        el('textarea', { rows: 2, value: d.description, oninput: (e) => { d.description = e.target.value; } })))));

  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: '2 · למי — יעד לפי מחוז / אזור / תפקיד' }),
    el('div', { class: 'form-grid' },
      field('תפקיד', roleSelect),
      field('מחוז', districtSelect),
      field('אזור', areaSelect)),
    el('div', { class: 'workers-preview' },
      matched.length === 0
        ? el('span', { class: 'chip overdue', text: 'אף עובד לא תואם ליעד שנבחר' })
        : matched.map((w) => el('span', { class: 'chip cat', text: `👷 ${w.name} · ${roleById(db, w.roleId)?.name ?? ''}` })))));

  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: '3 · מתי' }),
    el('div', { class: 'form-grid' },
      field('תאריך ביצוע', input('date', d.execDate, (v) => { d.execDate = v; })),
      field('שעת התחלה', input('time', d.execTime, (v) => { d.execTime = v; })),
      field('לסיים ולשלוח דוח עד', input('date', d.dueDate, (v) => { d.dueDate = v; }))),
    el('div', { class: 'btn-row', style: 'margin-top:0.8rem' },
      el('button', {
        class: 'btn', text: `שלח משימה ל-${matched.length} עובדים`,
        disabled: matched.length === 0,
        onclick: () => tryAction(() => {
          const task = dispatchTask(db, currentUser, {
            title: d.title, site: d.site, description: d.description,
            categoryId: d.categoryId, subcategoryId: d.subcategoryId,
            checks: d.checksText.split('\n'),
            target, execDate: d.execDate, execTime: d.execTime, dueDate: d.dueDate,
          }, ctx);
          ui.dispatch = null;
          ui.tab = 'tasks';
          ui.openTask = task.id;
          toast(`המשימה נשלחה ל-${task.assignments.length} עובדים ✔`);
        }),
      }))));
}

function select(value, options, onchange) {
  const node = el('select', { onchange: (e) => onchange(e.target.value) },
    options.map(([v, label]) => el('option', { value: v, text: label })));
  node.value = value;
  return node;
}

function input(type, value, oninput, placeholder = '') {
  return el('input', { type, value, placeholder, oninput: (e) => oninput(e.target.value) });
}

function field(label, node) {
  return el('div', { class: 'field' }, el('label', { text: label }), node);
}

function renderManagerTasks(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'משימות ודוחות' }));
  const tasks = companyTasks(db, currentUser.companyId);
  if (tasks.length === 0) {
    content.appendChild(el('div', { class: 'empty', text: 'עוד לא נשלחו משימות. עבור ל"שליחת משימה".' }));
    return;
  }
  for (const task of tasks) {
    const open = ui.openTask === task.id;
    const card = el('div', { class: 'card task-card' },
      el('div', { class: 'head', style: 'cursor:pointer', onclick: () => { ui.openTask = open ? null : task.id; render(); } },
        el('span', { class: 't', text: task.title }),
        el('span', { class: 'chip cat', text: catLabel(task) })),
      el('div', { class: 'meta' },
        task.site ? el('span', { text: `📍 ${task.site}` }) : null,
        el('span', { class: 'num', text: `🗓 ${fmtDate(task.execDate)} ${task.execTime}` }),
        el('span', { class: 'num', text: `⏳ עד ${fmtDate(task.dueDate)}` }),
        el('span', { text: `👷 ${task.assignments.length} עובדים` })));

    if (open) {
      for (const a of task.assignments) {
        card.appendChild(el('div', { class: 'assignee-row' },
          el('b', { text: userName(a.workerId) }),
          statusChip(task, a),
          el('span', { class: 'grow' }),
          (a.status === STATUS.SUBMITTED || a.status === STATUS.APPROVED) ? el('button', {
            class: 'btn small' + (a.status === STATUS.APPROVED ? ' secondary' : ''),
            text: 'צפה בדוח',
            onclick: () => { ui.reportView = { taskId: task.id, workerId: a.workerId }; render(); },
          }) : null));
      }
    }
    content.appendChild(card);
  }
}

function renderManagerWorkers(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'ניהול עובדים' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'רשום עובד עם שם משתמש משלך או אוטומטי. אפשר בכל עת לשנות שם, לאפס סיסמה, לשנות שם משתמש או למחוק.' }));

  const workers = db.users.filter((u) => u.kind === 'worker' && u.companyId === currentUser.companyId);
  const grid = el('div', { class: 'cards-grid' });
  for (const w of workers) grid.appendChild(userCard(w));
  if (workers.length === 0) grid.appendChild(el('div', { class: 'empty', text: 'עוד לא נרשמו עובדים.' }));
  content.appendChild(grid);
  content.appendChild(newWorkerCard());
}

function userCard(w) {
  const role = roleById(db, w.roleId);
  const district = districtById(db, w.districtId);
  const area = areaById(db, w.districtId, w.areaId);
  const canFull = canManageFully(currentUser, w);
  const canReset = canResetCredentials(currentUser, w);
  return el('div', { class: 'card task-card' },
    el('div', { class: 'head' },
      el('span', { class: 't', text: w.name }),
      role ? el('span', { class: 'chip cat', text: role.name }) : null,
      w.active ? null : el('span', { class: 'chip rejected', text: 'מושבת' })),
    el('div', { class: 'meta' },
      el('span', { text: `🗺 ${district?.name ?? 'ללא מחוז'}${area ? ' · ' + area.name : ''}` }),
      el('span', { class: 'num', text: `👤 ${w.username}` })),
    el('div', { class: 'btn-row' },
      canReset ? el('button', { class: 'btn secondary small', text: '🔑 אפס סיסמה', onclick: () => resetPasswordFlow(w) }) : null,
      canFull ? el('button', { class: 'btn secondary small', text: '✏️ ערוך', onclick: () => { ui.userEdit = { id: w.id, name: w.name, username: w.username }; render(); } }) : null,
      canReset ? el('button', { class: 'btn secondary small', text: w.active ? 'השבת' : 'הפעל', onclick: () => tryAction(() => setUserActive(db, currentUser, w.id, !w.active)) }) : null,
      canFull ? el('button', { class: 'btn danger small', text: '🗑', title: 'מחק', onclick: () => deleteUserFlow(w) }) : null));
}

function resetPasswordFlow(user) {
  const choice = window.prompt(`איפוס סיסמה ל-${user.name}.\nהקלד סיסמה חדשה, או השאר ריק כדי לייצר אוטומטית:`, '');
  if (choice === null) return;
  tryAction(() => {
    const pass = resetPassword(db, currentUser, user.id, choice.trim() || null, ctx);
    ui.modal = { title: 'הסיסמה אופסה', name: user.name, username: user.username, password: pass };
  });
}

function deleteUserFlow(user) {
  if (!window.confirm(`למחוק את ${user.name}? הפעולה תסיר גם את שיוכי המשימות שלו ואינה ניתנת לביטול.`)) return;
  tryAction(() => { deleteUser(db, currentUser, user.id); toast('העובד נמחק'); });
}

function newWorkerCard() {
  const st = { name: '', roleId: db.roles[0].id, districtId: '', areaId: '', username: '', auto: true };
  const nameInput = input('text', '', (v) => { st.name = v; }, 'למשל: אבי שלום');
  const roleSelect = select(st.roleId, db.roles.map((r) => [r.id, r.name]), (v) => { st.roleId = v; });
  const districtSelect = el('select', {}, el('option', { value: '', text: 'ללא מחוז' }), db.districts.map((x) => el('option', { value: x.id, text: x.name })));
  const areaSelect = el('select', {}, el('option', { value: '', text: 'ללא אזור' }));
  districtSelect.onchange = () => {
    st.districtId = districtSelect.value; st.areaId = '';
    areaSelect.replaceChildren(el('option', { value: '', text: 'ללא אזור' }));
    const dist = districtById(db, districtSelect.value);
    if (dist) for (const a of dist.areas) areaSelect.appendChild(el('option', { value: a.id, text: a.name }));
  };
  areaSelect.onchange = () => { st.areaId = areaSelect.value; };

  const userInput = input('text', '', (v) => { st.username = v; }, 'ריק = אוטומטי לפי התפקיד');
  const hint = el('span', { class: 'muted-note' });
  userInput.oninput = (e) => {
    st.username = e.target.value;
    const clean = normalizeUsername(st.username);
    hint.textContent = !clean ? '' : usernameAvailable(db, clean) ? `זמין: ${clean} ✓` : `תפוס/לא תקין: ${clean}`;
    hint.style.color = usernameAvailable(db, clean) ? 'var(--ok)' : 'var(--err)';
  };

  return el('div', { class: 'card' },
    el('h3', { text: 'רישום עובד חדש' }),
    el('div', { class: 'form-grid' },
      field('שם העובד', nameInput),
      field('תפקיד (מהרשומים באפליקציה)', roleSelect),
      field('מחוז', districtSelect),
      field('אזור', areaSelect),
      el('div', { class: 'field wide' }, el('label', { text: 'שם משתמש (אופציונלי — ריק = אוטומטי)' }), userInput, hint)),
    el('div', { class: 'btn-row', style: 'margin-top:0.7rem' },
      el('button', {
        class: 'btn', text: 'צור עובד + פרטי התחברות',
        onclick: () => tryAction(() => {
          const { user, credentials } = createWorker(db, currentUser, {
            name: st.name, roleId: st.roleId,
            districtId: st.districtId || undefined, areaId: st.areaId || undefined,
            username: st.username.trim() ? normalizeUsername(st.username) : undefined,
          }, ctx);
          ui.modal = { title: 'עובד נרשם בהצלחה', name: user.name, ...credentials };
        }),
      })));
}

// Edit-user modal (rename + change username).
function renderUserEditOverlay() {
  if (!ui.userEdit) return;
  const ue = ui.userEdit;
  const overlay = el('div', { class: 'overlay' },
    el('div', { class: 'modal', onclick: (e) => e.stopPropagation() },
      el('h3', { text: 'עריכת עובד' }),
      el('div', { class: 'field' }, el('label', { text: 'שם מלא' }), input('text', ue.name, (v) => { ue.name = v; })),
      el('div', { class: 'field' }, el('label', { text: 'שם משתמש להתחברות' }), input('text', ue.username, (v) => { ue.username = v; })),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn', text: 'שמור', onclick: () => tryAction(() => {
          renameUser(db, currentUser, ue.id, ue.name);
          const clean = normalizeUsername(ue.username);
          const cur = db.users.find((u) => u.id === ue.id);
          if (cur && clean && clean !== cur.username) changeUsername(db, currentUser, ue.id, ue.username);
          ui.userEdit = null; toast('נשמר ✔');
        }) }),
        el('button', { class: 'btn secondary', text: 'ביטול', onclick: () => { ui.userEdit = null; render(); } }))));
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Report view (manager review / worker history)
// ---------------------------------------------------------------------------

function renderReportView(content, { manager = false } = {}) {
  const { taskId, workerId } = ui.reportView;
  const task = db.tasks.find((t) => t.id === taskId);
  const assignment = task ? getAssignment(task, workerId) : null;
  if (!task || !assignment?.report) {
    ui.reportView = null;
    render();
    return;
  }
  const report = assignment.report;
  const defects = report.items.filter((i) => i.status === 'defect').length;

  content.appendChild(el('div', { class: 'btn-row' },
    el('button', { class: 'btn secondary small', text: '→ חזרה', onclick: () => { ui.reportView = null; render(); } }),
    el('span', { style: 'flex:1' }),
    el('button', { class: 'btn secondary small', text: '🖨️ הדפס / שמור PDF', onclick: () => printReport(task, assignment) })));
  content.appendChild(el('h2', { class: 'page-title', text: `דוח שטח — ${task.title}` }));
  content.appendChild(el('p', { class: 'page-sub' },
    `${userName(workerId)} · ${catLabel(task)} · נשלח ${new Date(report.submittedAt).toLocaleString('he-IL')}`));

  const card = el('div', { class: 'card' },
    el('div', { class: 'btn-row' },
      el('span', { class: 'chip ' + (defects ? 'defect' : 'ok'), text: defects ? `${defects} ליקויים` : 'ללא ליקויים' }),
      el('span', { class: `chip ${assignment.status}`, text: STATUS_LABELS[assignment.status] })));

  report.items.forEach((item, i) => {
    const photos = el('div', { class: 'photo-strip' },
      item.photos.map((src) => el('span', { class: 'photo-thumb' },
        el('img', { src, alt: `תמונה — ${task.checks[i]}`, onclick: () => { ui.lightbox = src; renderOverlays(); } }))));
    card.appendChild(el('div', { class: 'report-item' },
      el('div', { class: 'head' },
        el('span', { class: 't', text: task.checks[i] }),
        item.measurement ? el('span', { class: 'chip cat num', text: `📏 ${item.measurement.value} ${item.measurement.unit === 'cm' ? 'ס"מ' : 'מטר'}` }) : null,
        el('span', { class: 'chip ' + item.status, text: item.status === 'ok' ? 'תקין ✓' : 'ליקוי ✕' })),
      item.note ? el('div', { class: 'note' + (item.status === 'defect' ? ' defect' : ''), text: item.note }) : null,
      photos));
  });

  if (report.summary) {
    card.appendChild(el('div', { class: 'report-item' },
      el('div', { class: 'head' }, el('span', { class: 't', text: 'סיכום העובד' })),
      el('div', { class: 'note', text: report.summary })));
  }
  content.appendChild(card);

  // Already-resolved history note.
  if (assignment.resolution && assignment.resolution.kind !== 'approved') {
    const r = assignment.resolution;
    const txt = r.kind === 'reassigned' ? `הועברה לעובד ${userName(r.to)}`
      : r.kind === 'extended' ? `הוארך התאריך ל-${fmtDate(r.newDueDate)}`
      : r.kind === 'fined' ? `הוטל קנס ₪${r.amount}` : '';
    content.appendChild(el('div', { class: 'card', style: 'border-color:var(--warn)' },
      el('b', { text: 'טופל: ' }), el('span', { text: txt })));
  }

  if (manager && assignment.status === STATUS.SUBMITTED) {
    if (defects > 0) {
      content.appendChild(defectResolutionCard(task, assignment));
    } else {
      content.appendChild(el('div', { class: 'card' },
        el('h3', { text: 'אישור ותעודת מסירה' }),
        el('p', { class: 'muted-note', text: 'אשר את הדוח וחתום דיגיטלית להנפקת תעודת מסירה.' }),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn', text: 'אשר דוח ✔', onclick: () => tryAction(() => {
            approveAssignment(db, currentUser, task.id, workerId, ctx);
            ui.reportView = null; toast('הדוח אושר ✔');
          }) }),
          el('button', { class: 'btn accent', text: '✒️ אשר + תעודת מסירה חתומה', onclick: () => openSignatureModal(task.id, workerId) }))));
    }
  }

  // Approved report → offer the signed handover certificate.
  if (assignment.status === STATUS.APPROVED) {
    content.appendChild(el('div', { class: 'btn-row' },
      el('button', { class: 'btn accent small', text: '📜 הפק תעודת מסירה', onclick: () => printCertificate(task, assignment) })));
  }
}

function defectResolutionCard(task, assignment) {
  const workerId = assignment.workerId;
  const key = task.id + '|' + workerId;
  if (!ui.resolve || ui.resolve.key !== key) {
    ui.resolve = { key, kind: null, toWorkerId: '', dueDate: addDaysStr(task.dueDate, 3), amount: 1500, reason: '' };
  }
  const state = ui.resolve;
  const card = el('div', { class: 'card', style: 'border-color:var(--err)' });
  card.appendChild(el('h3', { text: '⚠️ נמצאו ליקויים — כיצד לטפל?' }));
  card.appendChild(el('p', { class: 'muted-note', text: 'בחר דרך טיפול: העברה לעובד אחר לתיקון, הארכת זמן הביצוע, או דחייה עם קנס לחברה האחראית.' }));

  const opt = (kind, title, desc) => el('button', {
    class: 'resolve-opt' + (state.kind === kind ? ' on' : ''),
    onclick: () => { state.kind = kind; render(); },
  }, el('span', { class: 'ro-t', text: title }), el('span', { class: 'ro-d', text: desc }));

  card.appendChild(el('div', { class: 'resolve-grid' },
    opt('reassign', '👷 העבר לעובד אחר', 'שליחת אותה משימה לעובד אחר לתיקון'),
    opt('extend', '📅 הארך זמן', 'דחיית תאריך היעד ופתיחת המשימה מחדש'),
    opt('fine', '💸 דחה + קנוס', 'דחיית העבודה והטלת קנס על החברה האחראית')));

  if (state.kind === 'reassign') {
    // Prefer same-role workers, but allow any active company worker not already on the task.
    const failedRole = db.users.find((u) => u.id === workerId)?.roleId;
    const eligible = db.users.filter((u) => u.kind === 'worker' && u.companyId === currentUser.companyId
      && u.active && u.id !== workerId && !getAssignment(task, u.id));
    const sameRole = eligible.filter((u) => u.roleId === failedRole);
    const pool = sameRole.length ? sameRole : eligible;
    const sel = select(state.toWorkerId || (pool[0]?.id ?? ''), pool.map((w) => [w.id, `${w.name} · ${roleById(db, w.roleId)?.name ?? ''}`]), (v) => { state.toWorkerId = v; });
    if (pool.length === 0) {
      card.appendChild(el('div', { class: 'scan-warn', text: 'אין עובד פעיל אחר להעברה — רשום עובד או בחר דרך טיפול אחרת.' }));
    } else {
      state.toWorkerId = state.toWorkerId || pool[0].id;
      card.appendChild(el('div', { class: 'form-grid', style: 'margin-top:0.6rem' },
        field('העבר לעובד', sel),
        field('הערה (אופציונלי)', input('text', state.reason, (v) => { state.reason = v; }))));
      card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
        el('button', { class: 'btn danger', text: 'העבר משימה', onclick: () => tryAction(() => {
          resolveDefect(db, currentUser, task.id, workerId, { kind: 'reassign', toWorkerId: state.toWorkerId, reason: state.reason }, ctx);
          ui.resolve = null; ui.reportView = null; toast('המשימה הועברה לעובד אחר ✔');
        }) })));
    }
  } else if (state.kind === 'extend') {
    card.appendChild(el('div', { class: 'form-grid', style: 'margin-top:0.6rem' },
      field('תאריך יעד חדש', input('date', state.dueDate, (v) => { state.dueDate = v; })),
      field('הערה (אופציונלי)', input('text', state.reason, (v) => { state.reason = v; }))));
    card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
      el('button', { class: 'btn', text: 'הארך והחזר לביצוע', onclick: () => tryAction(() => {
        resolveDefect(db, currentUser, task.id, workerId, { kind: 'extend', dueDate: state.dueDate, reason: state.reason }, ctx);
        ui.resolve = null; ui.reportView = null; toast('התאריך הוארך והמשימה נפתחה מחדש ✔');
      }) })));
  } else if (state.kind === 'fine') {
    card.appendChild(el('div', { class: 'form-grid', style: 'margin-top:0.6rem' },
      field('סכום הקנס (₪)', numInput(state.amount, 1, 1000000, (v) => { state.amount = v; })),
      field('סיבת הקנס', input('text', state.reason, (v) => { state.reason = v; }, 'למשל: ליקוי חוזר על חשבון הקבלן'))));
    card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:0.6rem' },
      el('button', { class: 'btn danger', text: 'דחה והטל קנס', onclick: () => tryAction(() => {
        resolveDefect(db, currentUser, task.id, workerId, { kind: 'fine', amount: state.amount, reason: state.reason }, ctx);
        ui.resolve = null; ui.reportView = null; toast(`נרשם קנס ₪${state.amount} ✔`);
      }) })));
  }
  return card;
}

// ===========================================================================
// Worker panel
// ===========================================================================

function renderWorker(content) {
  if (ui.reportView) return renderReportView(content, { manager: false });
  if (ui.execTask) return renderExecView(content);
  if (ui.tab === 'history') return renderWorkerHistory(content);
  return renderWorkerTasks(content);
}

function renderWorkerTasks(content) {
  content.appendChild(el('h2', { class: 'page-title', text: `המשימות של ${currentUser.name.split(' ')[0]}` }));

  const modeChip = (label, mode) => el('button', {
    class: 'demo-chip' + (ui.myTasksMode === mode ? ' active' : ''),
    style: ui.myTasksMode === mode ? 'border-color:var(--accent);color:var(--accent);font-weight:700' : '',
    text: label,
    onclick: () => { ui.myTasksMode = mode; render(); },
  });
  const dateInput = el('input', {
    type: 'date', value: ui.myTasksDate, style: 'max-width:170px',
    onchange: (e) => { ui.myTasksDate = e.target.value; ui.myTasksMode = 'date'; render(); },
  });
  content.appendChild(el('div', { class: 'btn-row' },
    modeChip('היום', 'today'), modeChip('הכול', 'all'), dateInput));

  const date = ui.myTasksMode === 'today' ? todayStr() : ui.myTasksMode === 'date' ? ui.myTasksDate : undefined;
  const entries = tasksForWorker(db, currentUser.id, { date })
    .filter(({ assignment }) => assignment.status !== STATUS.SUBMITTED && assignment.status !== STATUS.APPROVED);

  if (entries.length === 0) {
    content.appendChild(el('div', { class: 'empty', text: 'אין משימות פתוחות בתצוגה זו 🙌' }));
    return;
  }

  for (const { task, assignment } of entries) {
    content.appendChild(el('div', { class: 'card task-card' },
      el('div', { class: 'head' },
        el('span', { class: 't', text: task.title }),
        el('span', { class: 'chip cat', text: catLabel(task) }),
        statusChip(task, assignment)),
      el('div', { class: 'meta' },
        task.site ? el('span', { text: `📍 ${task.site}` }) : null,
        el('span', { class: 'num', text: `🗓 ביצוע: ${fmtDate(task.execDate)} בשעה ${task.execTime}` }),
        el('span', { class: 'num', text: `⏳ לסיים עד: ${fmtDate(task.dueDate)}` }),
        el('span', { text: `📋 ${task.checks.length} בדיקות (צילום חובה)` })),
      task.description ? el('div', { style: 'font-size:0.85rem;color:var(--muted)', text: task.description }) : null,
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn',
          text: assignment.status === STATUS.PENDING ? 'התחל ביצוע ▶' : 'המשך ביצוע ▶',
          onclick: () => tryAction(() => {
            if (assignment.status === STATUS.PENDING) startAssignment(db, currentUser, task.id, ctx);
            ui.execTask = task.id;
          }),
        }))));
  }
}

function renderWorkerHistory(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'דוחות שנשלחו' }));
  const entries = tasksForWorker(db, currentUser.id)
    .filter(({ assignment }) => assignment.status === STATUS.SUBMITTED || assignment.status === STATUS.APPROVED)
    .reverse();
  if (entries.length === 0) {
    content.appendChild(el('div', { class: 'empty', text: 'עוד לא נשלחו דוחות.' }));
    return;
  }
  for (const { task, assignment } of entries) {
    const defects = assignment.report.items.filter((i) => i.status === 'defect').length;
    content.appendChild(el('div', { class: 'card task-card' },
      el('div', { class: 'head' },
        el('span', { class: 't', text: task.title }),
        el('span', { class: `chip ${assignment.status}`, text: STATUS_LABELS[assignment.status] }),
        el('span', { class: 'chip ' + (defects ? 'defect' : 'ok'), text: defects ? `${defects} ליקויים` : 'ללא ליקויים' })),
      el('div', { class: 'meta' },
        el('span', { class: 'num', text: `נשלח: ${new Date(assignment.report.submittedAt).toLocaleDateString('he-IL')}` })),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn secondary small', text: 'צפה בדוח',
          onclick: () => { ui.reportView = { taskId: task.id, workerId: currentUser.id }; render(); },
        }))));
  }
}

// ---------------------------------------------------------------------------
// Worker — execution view (the heart of the field flow)
// ---------------------------------------------------------------------------

function itemComplete(item) {
  return (item.status === 'ok' || item.status === 'defect')
    && item.photos.length >= 1
    && (item.status !== 'defect' || item.note.trim() !== '');
}

function renderExecView(content) {
  const task = db.tasks.find((t) => t.id === ui.execTask);
  const assignment = task ? getAssignment(task, currentUser.id) : null;
  if (!task || !assignment || assignment.status === STATUS.SUBMITTED || assignment.status === STATUS.APPROVED) {
    ui.execTask = null;
    render();
    return;
  }
  if (!assignment.draft) assignment.draft = { items: task.checks.map(() => emptyDraftItem()) };
  const draft = assignment.draft;

  content.appendChild(el('div', { class: 'btn-row' },
    el('button', { class: 'btn secondary small', text: '→ שמור וחזור', onclick: () => { persist(); ui.execTask = null; render(); } })));
  content.appendChild(el('h2', { class: 'page-title', text: task.title }));
  content.appendChild(el('p', { class: 'page-sub' },
    `${catLabel(task)}${task.site ? ' · 📍 ' + task.site : ''} · לסיים עד ${fmtDate(task.dueDate)} · לכל בדיקה חובה לצרף תמונה`));
  if (task.description) content.appendChild(el('div', { class: 'card', style: 'font-size:0.88rem', text: task.description }));

  task.checks.forEach((label, i) => content.appendChild(checkItemNode(task, draft, label, i)));

  const summaryArea = el('textarea', {
    rows: 2, placeholder: 'סיכום כללי לדוח (רשות) — למשל: נמצאו 2 ליקויים בקומה 3',
    value: draft.summary ?? '',
    oninput: (e) => { draft.summary = e.target.value; saveDraftQuiet(task); },
  });
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'סיכום הדוח' }), summaryArea));

  const completeCount = draft.items.filter(itemComplete).length;
  const submitBtn = el('button', {
    class: 'btn', id: 'exec-submit',
    text: '📤 שלח דוח מפורט למנהל',
    disabled: completeCount < task.checks.length,
    onclick: () => {
      try {
        const items = draft.items.map((item) => ({
          status: item.status,
          note: item.note,
          photos: item.photos,
          measurement: String(item.value).trim() !== ''
            ? { value: Number(item.value), unit: item.unit }
            : null,
        }));
        submitReport(db, currentUser, task.id, { items, summary: draft.summary ?? '' }, ctx);
        persist();
        ui.execTask = null;
        ui.tab = 'history';
        toast('הדוח נשלח למנהל ✔');
        render();
      } catch (e) {
        toast(e.message, true);
      }
    },
  });
  content.appendChild(el('div', { class: 'progress-bar' },
    el('span', { class: 'label', id: 'exec-progress-label', text: `${completeCount}/${task.checks.length} בדיקות הושלמו` }),
    el('span', { class: 'track' }, el('span', { class: 'fill', id: 'exec-progress-fill', style: `width:${(completeCount / task.checks.length) * 100}%` })),
    submitBtn));
}

function saveDraftQuiet(task) {
  try {
    saveDraft(db, currentUser, task.id, getAssignment(task, currentUser.id).draft);
    persist();
  } catch { /* draft already locked */ }
}

function updateExecDerived(task, draft) {
  const complete = draft.items.filter(itemComplete).length;
  const label = document.getElementById('exec-progress-label');
  const fill = document.getElementById('exec-progress-fill');
  const submit = document.getElementById('exec-submit');
  if (label) label.textContent = `${complete}/${task.checks.length} בדיקות הושלמו`;
  if (fill) fill.style.width = `${(complete / task.checks.length) * 100}%`;
  if (submit) submit.disabled = complete < task.checks.length;
}

function checkItemNode(task, draft, label, i) {
  const item = draft.items[i];
  const node = el('div', { class: 'check-item ' + (itemComplete(item) ? 'complete' : 'missing') });

  const rerenderItem = () => {
    const fresh = checkItemNode(task, draft, label, i);
    node.replaceWith(fresh);
    updateExecDerived(task, draft);
  };

  const okBtn = el('button', { class: item.status === 'ok' ? 'on-ok' : '', text: 'תקין ✓', onclick: () => { item.status = 'ok'; saveDraftQuiet(task); rerenderItem(); } });
  const defectBtn = el('button', { class: item.status === 'defect' ? 'on-defect' : '', text: 'ליקוי ✕', onclick: () => { item.status = 'defect'; saveDraftQuiet(task); rerenderItem(); } });

  node.appendChild(el('div', { class: 'head' },
    el('span', { class: 't', text: `${i + 1}. ${label}` }),
    el('span', { class: 'seg' }, okBtn, defectBtn)));

  node.appendChild(el('div', { class: 'measure-row' },
    el('span', { style: 'font-size:0.78rem;color:var(--muted)', text: '📏 מדידה (רשות):' }),
    el('input', {
      type: 'number', step: 'any', inputMode: 'decimal', placeholder: 'ערך',
      value: item.value,
      oninput: (e) => { item.value = e.target.value; saveDraftQuiet(task); },
    }),
    el('select', {
      onchange: (e) => { item.unit = e.target.value; saveDraftQuiet(task); },
      value: item.unit,
    }, MEASUREMENT_UNITS.map((u) => {
      const opt = el('option', { value: u.id, text: u.label });
      if (u.id === item.unit) opt.selected = true;
      return opt;
    }))));

  const noteInput = el('input', {
    type: 'text',
    placeholder: item.status === 'defect' ? 'חובה: תאר את הליקוי שנמצא' : 'הערה (רשות)',
    value: item.note,
    oninput: (e) => { item.note = e.target.value; saveDraftQuiet(task); updateExecDerived(task, draft); },
  });
  node.appendChild(el('div', { class: 'field' }, noteInput));

  const fileInput = el('input', {
    type: 'file', accept: 'image/*', multiple: true, capture: 'environment',
    style: 'display:none',
    onchange: async (e) => {
      const files = [...e.target.files].slice(0, 4 - item.photos.length);
      for (const file of files) {
        try {
          item.photos.push(await compressImage(file));
        } catch {
          toast('קובץ תמונה לא נתמך', true);
        }
      }
      saveDraftQuiet(task);
      rerenderItem();
    },
  });

  const strip = el('div', { class: 'photo-strip' },
    item.photos.map((src, pi) => el('span', { class: 'photo-thumb' },
      el('img', { src, alt: `תמונה ${pi + 1}`, onclick: () => { ui.lightbox = src; renderOverlays(); } }),
      el('button', { class: 'rm', text: '✕', title: 'הסר תמונה', onclick: () => { item.photos.splice(pi, 1); saveDraftQuiet(task); rerenderItem(); } }))),
    item.photos.length < 4 ? el('button', {
      class: 'photo-add',
      onclick: () => fileInput.click(),
      html: '📷<span>הוסף תמונה</span>',
    }) : null,
    fileInput,
    el('span', {
      class: 'photo-required' + (item.photos.length > 0 ? ' satisfied' : ''),
      text: item.photos.length > 0 ? `✓ ${item.photos.length} תמונות` : 'חובה לצרף תמונה',
    }));
  node.appendChild(strip);

  return node;
}

/** Downscale a camera photo to ~1000px JPEG so localStorage stays small. */
function compressImage(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// ===========================================================================
// Smart assistant (העוזר החכם) — floating drawer, all roles
// ===========================================================================

function assistantFab() {
  return el('button', {
    class: 'assistant-fab' + (ui.assistantOpen ? ' open' : ''),
    title: 'העוזר החכם',
    'aria-label': 'פתח את העוזר החכם',
    onclick: () => {
      ui.assistantOpen = !ui.assistantOpen;
      if (ui.assistantOpen && ui.assistantLog.length === 0) {
        ui.assistantLog.push({ who: 'ai', text: assistantIntro(db, currentUser), actions: [] });
      }
      render();
      focusAssistantInput();
    },
    html: ui.assistantOpen ? '✕' : '💬',
  });
}

function focusAssistantInput() {
  requestAnimationFrame(() => document.getElementById('assistant-input')?.focus());
}

function assistantPanel() {
  const log = el('div', { class: 'assistant-log' });
  for (const msg of ui.assistantLog) {
    const bubble = el('div', { class: `a-bubble ${msg.who}`, html: mdLite(msg.text) });
    log.appendChild(bubble);
    if (msg.actions?.length) {
      const row = el('div', { class: 'a-actions' });
      for (const action of msg.actions) {
        row.appendChild(el('button', { class: 'a-chip', text: action.label, onclick: () => runAssistantAction(action) }));
      }
      log.appendChild(row);
    }
  }

  const suggestions = currentUser.kind === 'worker'
    ? ['מה יש לי היום?', 'משימות באיחור', 'מה גובה נקודות מים בכיור?']
    : currentUser.kind === 'manager'
      ? ['מה מצב המשימות?', 'כמה ליקויים ואיפה?', 'מי העובד המוביל?', 'מה שיפוע דלוחין תקין?']
      : ['מה הסטטוס במערכת?', 'מה זה שטיכמוס?'];

  const sugRow = el('div', { class: 'a-suggest' },
    suggestions.map((s) => el('button', { class: 'a-sug', text: s, onclick: () => sendAssistant(s) })));

  const inputEl = el('input', {
    id: 'assistant-input', type: 'text', placeholder: 'שאל אותי כל דבר…', autocomplete: 'off',
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) sendAssistant(e.target.value); },
  });

  const panel = el('div', { class: 'assistant-panel', role: 'dialog', 'aria-label': 'העוזר החכם' },
    el('div', { class: 'assistant-head' },
      el('span', { html: '🤖 <b>העוזר החכם</b>' }),
      el('span', { class: 'a-badge', text: 'AI' }),
      el('span', { style: 'flex:1' }),
      el('button', { class: 'a-close', text: '✕', 'aria-label': 'סגור', onclick: () => { ui.assistantOpen = false; render(); } })),
    log,
    sugRow,
    el('div', { class: 'assistant-input-row' },
      inputEl,
      el('button', { class: 'a-send', text: 'שלח', onclick: () => { if (inputEl.value.trim()) sendAssistant(inputEl.value); } })));

  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return panel;
}

function sendAssistant(text) {
  ui.assistantLog.push({ who: 'user', text, actions: [] });
  const res = askAssistant(db, currentUser, text, { today: todayStr() });
  ui.assistantLog.push({ who: 'ai', text: res.answer, actions: res.actions ?? [], source: res.source });
  render();
  focusAssistantInput();
}

function runAssistantAction(action) {
  if (action.type === 'open_tab') {
    ui.tab = action.tab;
    ui.assistantOpen = false;
  } else if (action.type === 'dispatch_draft') {
    ui.tab = 'dispatch';
    ui.dispatch = null;
    render();
    // Prefill after the dispatch form initializes its defaults.
    ui.dispatch = {
      categoryId: action.categoryId,
      subcategoryId: action.subcategoryId,
      checksText: subcategoryById(db, action.categoryId, action.subcategoryId)?.checks.join('\n') ?? '',
      roleId: '', districtId: '', areaId: '',
      title: '', site: '', description: '',
      execDate: todayStr(), execTime: '08:00', dueDate: addDaysStr(todayStr(), 2),
    };
    ui.assistantOpen = false;
  }
  render();
}

// ===========================================================================
// Dashboard — analytics with SVG charts
// ===========================================================================

function renderManagerDashboard(content) {
  content.appendChild(el('h2', { class: 'page-title', text: 'דשבורד ניהולי' }));
  const stats = companyStats(db, currentUser.companyId, todayStr());
  content.appendChild(el('div', { class: 'stat-row' },
    stat(stats.total, 'סה"כ שיוכים'),
    stat(stats.approved, 'אושרו'),
    stat(stats.submitted, 'לאישור'),
    stat(stats.in_progress, 'בביצוע'),
    el('div', { class: 'stat overdue' }, el('div', { class: 'v', text: stats.overdue }), el('div', { class: 'l', text: 'באיחור' }))));

  // Project risk gauge — composite health indicator.
  const risk = riskScore(db, currentUser.companyId, todayStr());
  content.appendChild(el('div', { class: 'card risk-card' },
    riskGauge(risk),
    el('div', { style: 'flex:1;min-width:200px' },
      el('h3', { style: 'margin-bottom:0.4rem', text: 'מדד סיכון פרויקט' }),
      el('p', { class: 'muted-note', style: 'margin:0 0 0.6rem', text: 'אינדיקטור משולב לתיעדוף — משקלל ליקויים, איחורים, דחיות וקנסות פתוחים.' }),
      el('div', { class: 'risk-factors' },
        riskFactor('שיעור ליקויים', `${risk.factors.defectRate}%`),
        riskFactor('שיעור איחורים', `${risk.factors.overdueRate}%`),
        riskFactor('שיעור דחיות', `${risk.factors.rejectRate}%`),
        riskFactor('קנסות פתוחים', risk.factors.openFines)))));

  // Trend — reports per day, single-hue area+line.
  const trend = reportTrend(db, currentUser.companyId, todayStr(), 14);
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'דוחות שנשלחו — 14 ימים אחרונים' }),
    trendChart(trend)));

  // Defects by category — single status-hue bars, direct-labeled + table.
  const defects = defectsByCategory(db, currentUser.companyId);
  const defectCard = el('div', { class: 'card' }, el('h3', { text: 'ליקויים לפי קטגוריה' }));
  if (defects.length === 0 || defects.every((d) => d.defects === 0)) {
    defectCard.appendChild(el('div', { class: 'empty', text: 'לא דווחו ליקויים 🎉' }));
  } else {
    defectCard.appendChild(defectChart(defects.filter((d) => d.defects > 0)));
  }
  content.appendChild(defectCard);

  // Export — real Excel-CSV files.
  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'ייצוא נתונים' }),
    el('p', { class: 'muted-note', text: 'קבצי Excel (CSV) מרוכזים לשליחה ליזם, למפקח או לקבלן משנה.' }),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn accent small', text: '📊 ייצוא ליקויים ל-Excel', onclick: exportDefectReport }),
      el('button', { class: 'btn secondary small', text: '💸 ייצוא קנסות ל-Excel', onclick: exportFinesCsv }))));
}

function riskGauge(risk) {
  const color = risk.band === 'high' ? 'var(--err)' : risk.band === 'medium' ? 'var(--warn)' : 'var(--ok)';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '96'); svg.setAttribute('height', '96');
  const circ = 2 * Math.PI * 42;
  const off = circ * (1 - risk.score / 100);
  svg.innerHTML = `
    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
    <circle cx="50" cy="50" r="42" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 50 50)"/>`;
  return el('div', { class: 'risk-gauge' }, svg,
    el('div', { class: 'val' }, el('b', { style: `color:${color}`, text: risk.score }), el('span', { text: `סיכון ${risk.bandLabel}` })));
}

function riskFactor(label, value) {
  return el('div', { class: 'rf' }, el('span', { class: 'muted-note', text: label }), el('b', { class: 'num', text: value }));
}

function trendChart(trend) {
  const W = 620, H = 150, padX = 8, padY = 16;
  const max = Math.max(1, ...trend.map((d) => d.count));
  const stepX = (W - padX * 2) / Math.max(1, trend.length - 1);
  const x = (i) => padX + i * stepX;
  const y = (v) => H - padY - (v / max) * (H - padY * 2);
  const pts = trend.map((d, i) => [x(i), y(d.count)]);
  const linePath = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(trend.length - 1).toFixed(1)},${H - padY} L${padX},${H - padY} Z`;
  const total = trend.reduce((s, d) => s + d.count, 0);

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `דוחות ליום ב-14 הימים האחרונים, סה"כ ${total}`);
  svg.innerHTML = `
    <line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" class="chart-axis"/>
    <path d="${areaPath}" class="chart-area"/>
    <path d="${linePath}" class="chart-line"/>
    ${pts.map(([px, py], i) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" class="chart-dot" data-i="${i}"><title>${trend[i].date}: ${trend[i].count} דוחות</title></circle>`).join('')}
    ${pts.map(([px, py], i) => trend[i].count > 0 ? `<text x="${px.toFixed(1)}" y="${(py - 7).toFixed(1)}" class="chart-pt-label">${trend[i].count}</text>` : '').join('')}
  `;
  const wrap = el('div', { class: 'chart-wrap' }, svg);
  const labels = el('div', { class: 'chart-xlabels' });
  trend.forEach((d, i) => {
    if (i % 2 === 0 || i === trend.length - 1) {
      const [dd, mm] = [d.date.slice(8), d.date.slice(5, 7)];
      labels.appendChild(el('span', { style: `inset-inline-start:${(x(i) / W * 100).toFixed(1)}%`, text: `${dd}.${mm}` }));
    }
  });
  return el('div', {}, wrap, labels);
}

function defectChart(rows) {
  const max = Math.max(...rows.map((r) => r.defects));
  const list = el('div', { class: 'bar-list' });
  for (const r of rows) {
    const pct = (r.defects / max) * 100;
    const rate = r.checks > 0 ? Math.round((r.defects / r.checks) * 100) : 0;
    list.appendChild(el('div', { class: 'bar-row' },
      el('span', { class: 'bar-label', text: `${categoryById(db, r.categoryId)?.icon ?? ''} ${r.name}` }),
      el('span', { class: 'bar-track' },
        el('span', { class: 'bar-fill', style: `width:${Math.max(6, pct)}%`, title: `${r.defects} ליקויים מתוך ${r.checks} בדיקות` })),
      el('span', { class: 'bar-value num', text: `${r.defects} · ${rate}%` })));
  }
  return list;
}

// ---------------------------------------------------------------------------
// Downloads & printing (Excel-CSV via the downloads capability with a blob
// fallback; PDF via a print iframe — the browser's "save as PDF").
// ---------------------------------------------------------------------------

async function saveFile(filename, data, mime = 'text/plain') {
  if (window.claude?.downloads) {
    try {
      await window.claude.downloads.save({ filename, data });
      toast('הקובץ הורד ✔');
      return true;
    } catch (e) {
      if (e?.code === 'declined') { toast('ההורדה בוטלה', true); return false; }
      if (e?.code === 'extension_not_enabled') { toast('סוג הקובץ אינו זמין כאן — נסה הדפסה ל-PDF', true); return false; }
      // other errors: fall through to blob fallback
    }
  }
  try {
    const blob = new Blob([data], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('הקובץ הורד ✔');
    return true;
  } catch {
    toast('הורדה אינה נתמכת בתצוגה זו', true);
    return false;
  }
}

/** Print a full HTML document via a hidden iframe → browser "save as PDF". */
function printHtmlDocument(fullHtml) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;inset:0;width:0;height:0;border:0;opacity:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(fullHtml); doc.close();
  const go = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      toast('הדפסה אינה נתמכת כאן — נסה ייצוא Excel', true);
    }
    setTimeout(() => frame.remove(), 1500);
  };
  if (frame.contentWindow.document.readyState === 'complete') setTimeout(go, 250);
  else frame.onload = () => setTimeout(go, 250);
}

function companyLogoDataUrl(company) {
  return company?.logoImage ?? null; // generated SVG marks aren't embedded as data URLs
}

/** Pick an image file, square-crop + downscale it, and store as the logo. */
function uploadLogoFlow(company) {
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await squareLogo(file);
      tryAction(() => { setCompanyLogoImage(db, currentUser, company.id, dataUrl); toast('הלוגו עודכן ✔'); });
    } catch {
      toast('קובץ תמונה לא נתמך', true);
    }
  };
  document.body.appendChild(fileInput);
  fileInput.click();
  setTimeout(() => fileInput.remove(), 1000);
}

/** Center-crop an image to a square and scale to 256px PNG. */
function squareLogo(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

async function exportDefectReport() {
  const csv = buildDefectsCsv(db, currentUser.companyId, userName);
  await saveFile(`defects-${todayStr()}.csv`, csv, 'text/csv');
}

async function exportFinesCsv() {
  const csv = buildFinesCsv(db, currentUser.companyId, userName);
  await saveFile(`fines-${todayStr()}.csv`, csv, 'text/csv');
}

function printReport(task, assignment) {
  const company = companyOf(db, currentUser);
  const html = buildReportHtml({
    company, task, assignment,
    workerName: userName(assignment.workerId),
    approverName: assignment.approvedBy ? userName(assignment.approvedBy) : null,
    categoryName: categoryById(db, task.categoryId)?.name ?? '',
    logoDataUrl: companyLogoDataUrl(company),
  });
  printHtmlDocument(html);
}

function certId(task, workerId) {
  return `BC-${task.id.replace(/[^a-z0-9]/gi, '').toUpperCase()}-${workerId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`;
}

function printCertificate(task, assignment) {
  const company = companyOf(db, currentUser);
  const html = buildCertificateHtml({
    company, task,
    workerName: userName(assignment.workerId),
    approverName: assignment.approvedBy ? userName(assignment.approvedBy) : currentUser.name,
    signatureDataUrl: assignment.certificate?.signature ?? null,
    certId: certId(task, assignment.workerId),
    date: (assignment.approvedAt ?? new Date().toISOString()).slice(0, 10),
    logoDataUrl: companyLogoDataUrl(company),
  });
  printHtmlDocument(html);
}

// Signature capture modal (canvas) → approve with an embedded signature.
function openSignatureModal(taskId, workerId) {
  ui.sigModal = { taskId, workerId };
  render();
}

function renderSignatureOverlay() {
  if (!ui.sigModal) return;
  const { taskId, workerId } = ui.sigModal;
  const canvas = el('canvas', { class: 'sigpad', width: 400, height: 150 });
  // Scale the backing store to the displayed size after mount.
  let drawing = false, dirty = false, ctx2d = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing = true; ctx2d = ctx2d || canvas.getContext('2d'); const { x, y } = pos(e); ctx2d.beginPath(); ctx2d.moveTo(x, y); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const { x, y } = pos(e); ctx2d.lineTo(x, y); ctx2d.strokeStyle = '#16324f'; ctx2d.lineWidth = 2.4; ctx2d.lineCap = 'round'; ctx2d.stroke(); dirty = true; };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);

  const overlay = el('div', { class: 'overlay' },
    el('div', { class: 'modal', onclick: (e) => e.stopPropagation() },
      el('h3', { text: '✒️ חתימת אישור דיגיטלית' }),
      el('p', { class: 'muted-note', text: 'חתום באצבע או בעכבר לאישור המשימה והנפקת תעודת מסירה.' }),
      canvas,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn', text: 'אשר וחתום ✔', onclick: () => {
          if (!dirty) { toast('נא לחתום קודם', true); return; }
          tryAction(() => {
            approveAssignment(db, currentUser, taskId, workerId, ctx, { signature: canvas.toDataURL('image/png') });
            ui.sigModal = null; ui.reportView = null; toast('אושר ונחתם ✔');
          });
        } }),
        el('button', { class: 'btn secondary', text: 'נקה', onclick: () => { ctx2d = ctx2d || canvas.getContext('2d'); ctx2d.clearRect(0, 0, canvas.width, canvas.height); dirty = false; } }),
        el('button', { class: 'btn secondary', text: 'ביטול', onclick: () => { ui.sigModal = null; render(); } }))));
  document.body.appendChild(overlay);
}

// ===========================================================================
// Plan Studio (סטודיו תוכניות) — upload, AI analysis, program generation
// ===========================================================================

function renderManagerStudio(content) {
  content.appendChild(el('h2', { class: 'page-title', text: '📐 סטודיו תוכניות' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'העלה גרמושקה או סקיצת 3D — המערכת מנתחת את התוכנית, בונה פרופיל פרויקט, ומייצרת תוכנית ביקורת מלאה לשיגור בלחיצה.' }));

  const s = ui.studio;

  // Existing projects.
  const projects = (db.projects ?? []).filter((p) => p.companyId === currentUser.companyId);
  if (projects.length > 0 && (!s || s.step === 'upload')) {
    const card = el('div', { class: 'card' }, el('h3', { text: `פרויקטים שנותחו (${projects.length})` }));
    for (const p of projects) {
      card.appendChild(el('div', { class: 'assignee-row' },
        el('b', { text: p.name }),
        el('span', { class: 'chip cat num', text: `${p.taskIds.length} משימות` }),
        p.skippedCount ? el('span', { class: 'chip overdue', text: `${p.skippedCount} דולגו` }) : null,
        el('span', { class: 'grow' }),
        el('span', { class: 'muted-note num', text: new Date(p.createdAt).toLocaleDateString('he-IL') })));
    }
    content.appendChild(card);
  }

  if (!s || s.step === 'upload') return renderStudioUpload(content);
  if (s.step === 'analyzing') return renderStudioAnalyzing(content);
  if (s.step === 'profile') return renderStudioProfile(content);
  if (s.step === 'program') return renderStudioProgram(content);
}

function renderStudioUpload(content) {
  const fileInput = el('input', {
    type: 'file', accept: 'image/*,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', style: 'display:none',
    onchange: (e) => { if (e.target.files[0]) startAnalysis(e.target.files[0]); },
  });
  content.appendChild(el('div', { class: 'card studio-drop' },
    el('div', { class: 'studio-drop-inner' },
      el('div', { class: 'studio-icon', html: '📐' }),
      el('h3', { text: 'העלה תוכנית או מפרט לניתוח' }),
      el('p', { class: 'muted-note', text: 'גרמושקה, תוכנית קומה, חתך או סקיצת 3D (JPG/PNG) — או מסמך PDF / Word (DOCX). ה-AI סורק את התוכן ומפיק תוכנית ביקורת.' }),
      el('div', { class: 'filetype-row' },
        el('span', { class: 'chip cat', text: '🖼️ תמונה' }),
        el('span', { class: 'chip cat', text: '📄 PDF' }),
        el('span', { class: 'chip cat', text: '📝 Word' })),
      fileInput,
      el('button', { class: 'btn', text: '📎 בחר קובץ', onclick: () => fileInput.click() }),
      el('button', { class: 'btn secondary small', text: 'דלג — הזן פרטי פרויקט ידנית', onclick: () => { ui.studio = blankProfile(); ui.studio.step = 'profile'; render(); } }))));
}

function fileKind(file) {
  const name = (file.name || '').toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return 'docx';
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'image';
  return 'unknown';
}

// Browser inflaters for docparse (raw-deflate for ZIP, zlib for PDF Flate).
async function streamInflate(bytes, format) {
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const inflateRaw = (b) => streamInflate(b, 'deflate-raw');
const inflateZlib = (b) => streamInflate(b, 'deflate');

function blankProfile() {
  return {
    step: 'profile',
    analysis: null,
    preview: null,
    projectName: 'פרויקט חדש',
    floors: 6, apartmentsPerFloor: 4,
    hasElevator: true, hasMamad: true, hasRoof: true,
    startDate: todayStr(),
    categoryIds: ['shell', 'plumbing', 'electric', 'hvac', 'sealing', 'finish', 'safety'],
  };
}

async function startAnalysis(file) {
  const kind = fileKind(file);
  ui.studio = { step: 'analyzing', filename: file.name, kind };
  render();
  try {
    if (kind === 'image') {
      const preview = await compressImage(file, 1000, 0.75);
      const analysis = await analyzeImageFile(preview);
      const profile = blankProfile();
      profile.step = 'profile';
      profile.analysis = analysis;
      profile.scan = buildScanReport(analysis);
      profile.verified = false;
      profile.preview = preview;
      profile.projectName = guessProjectName(file.name);
      profile.floors = analysis.complexity >= 4 ? 12 : analysis.complexity >= 3 ? 8 : 5;
      ui.studio = profile;
    } else if (kind === 'pdf' || kind === 'docx') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = kind === 'docx'
        ? await extractDocxText(bytes, { inflateRaw })
        : await extractPdfText(bytes, { inflate: inflateZlib });
      const review = reviewDocument({ text, kind, filename: file.name });
      const profile = blankProfile();
      profile.step = 'profile';
      profile.docReview = review;
      profile.verified = false;
      profile.projectName = review.profile.projectName;
      profile.floors = review.profile.floors;
      profile.apartmentsPerFloor = review.profile.apartmentsPerFloor;
      profile.hasElevator = review.profile.hasElevator;
      profile.hasMamad = review.profile.hasMamad;
      profile.hasRoof = review.profile.hasRoof;
      profile.categoryIds = review.profile.categoryIds;
      ui.studio = profile;
    } else {
      toast('סוג קובץ לא נתמך — העלה תמונה, PDF או Word', true);
      ui.studio = null;
    }
    render();
  } catch (e) {
    toast('שגיאה בניתוח הקובץ: ' + e.message, true);
    ui.studio = null;
    render();
  }
}

/** Draw the image to a downscaled canvas and run analyzePixels on it. */
function analyzeImageFile(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 260;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const cx = canvas.getContext('2d');
      cx.drawImage(img, 0, 0, w, h);
      const imgData = cx.getImageData(0, 0, w, h);
      resolve(analyzePixels(imgData));
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = dataUrl;
  });
}

function renderStudioAnalyzing(content) {
  const k = ui.studio?.kind;
  const detail = k === 'pdf' ? 'חילוץ טקסט מה-PDF וזיהוי ישויות' : k === 'docx' ? 'קריאת מסמך Word וזיהוי ישויות' : 'זיהוי סוג השרטוט, צפיפות וקווי מבנה';
  content.appendChild(el('div', { class: 'card studio-analyzing' },
    el('div', { class: 'spinner' }),
    el('h3', { text: 'מנתח את הקובץ…' }),
    el('p', { class: 'muted-note', text: detail })));
}

// Thorough AI review of an extracted PDF/Word document.
function docReviewCard(review) {
  const confColor = review.confidence >= 70 ? 'var(--ok)' : review.confidence >= 50 ? 'var(--warn)' : 'var(--err)';
  const f = review.fields;
  const card = el('div', { class: 'card' },
    el('div', { class: 'btn-row' },
      el('span', { class: 'chip ' + (review.readable ? 'approved' : 'rejected'), text: review.kindLabel }),
      el('span', { class: 'chip cat', text: `ודאות ${review.confidence}%` }),
      el('span', { class: 'chip cat', text: `קריאוּת ${review.readability}%` })),
    el('div', { class: 'confidence-meter' }, el('span', { class: 'cfill', style: `width:${review.confidence}%;background:${confColor}` })));

  // Extracted structured fields.
  const chips = [];
  if (f.building) chips.push(`🏢 מבנה ${f.building}`);
  if (f.maxFloor) chips.push(`🏗️ עד קומה ${f.maxFloor}`);
  if (f.maxApartment) chips.push(`🚪 עד דירה ${f.maxApartment}`);
  for (const r of f.rooms) chips.push(`🚻 ${r.name}×${r.count}`);
  for (const std of f.standards) chips.push(`📏 ${std}`);
  if (chips.length) {
    card.appendChild(el('h3', { style: 'margin:0.9rem 0 0.4rem', text: 'נתונים שחולצו מהמסמך' }));
    card.appendChild(el('div', { class: 'workers-preview' }, chips.map((c) => el('span', { class: 'chip cat', text: c }))));
  }
  if (f.dimensions.length) {
    card.appendChild(el('p', { class: 'muted-note', style: 'margin-top:0.5rem', text: `מידות שזוהו (${f.dimensions.length}): ${f.dimensions.slice(0, 10).join(' · ')}${f.dimensions.length > 10 ? ' …' : ''}` }));
  }

  card.appendChild(el('h3', { style: 'margin:0.9rem 0 0.5rem', text: 'ממצאי הסקירה' }));
  const findings = el('div', { class: 'scan-findings' });
  for (const fi of review.findings) {
    findings.appendChild(el('div', { class: 'scan-find' }, el('span', { class: 'ic', text: fi.ok ? '✅' : '⚠️' }), el('span', { text: fi.label })));
  }
  card.appendChild(findings);
  for (const w of review.warnings) {
    card.appendChild(el('div', { class: 'scan-warn', style: 'margin-top:0.5rem' }, el('span', { text: '⚠️' }), el('span', { text: w })));
  }
  return card;
}

// Mandatory human-verification gate — a mis-read of a plan/spec risks fines,
// so a program can never be dispatched until the manager confirms the review.
function verifyGate(s, mustVerify) {
  const list = mustVerify ?? s.docReview?.mustVerify ?? [];
  return el('div', { class: 'scan-verify', style: 'margin-top:0.7rem' },
    el('b', { text: '⚠️ חובה לאמת ידנית לפני שיגור:' }),
    el('ul', {}, list.map((v) => el('li', { text: v }))),
    el('label', { class: 'checkbox-field', style: 'padding-top:0.5rem' },
      (() => { const cb = el('input', { type: 'checkbox', onchange: (e) => { s.verified = e.target.checked; render(); } }); cb.checked = s.verified; return cb; })(),
      el('span', { text: 'אני מאשר שבדקתי את הקובץ ידנית והפרטים נכונים — הסריקה היא כלי עזר בלבד ואינה תחליף לבדיקת אדם.' })));
}

function renderStudioProfile(content) {
  const s = ui.studio;
  const a = s.analysis;
  const scan = s.scan;

  if (s.docReview) {
    const card = docReviewCard(s.docReview);
    card.appendChild(verifyGate(s, s.docReview.mustVerify));
    content.appendChild(card);
  }

  if (a && scan) {
    const confColor = scan.confidence >= 70 ? 'var(--ok)' : scan.confidence >= 50 ? 'var(--warn)' : 'var(--err)';
    const analysisCard = el('div', { class: 'card' },
      el('div', { class: 'studio-analysis' },
        s.preview ? el('img', { class: 'studio-preview', src: s.preview, alt: 'תצוגת התוכנית', onclick: () => { ui.lightbox = s.preview; renderOverlays(); } }) : null,
        el('div', { class: 'studio-verdict' },
          el('div', { class: 'btn-row' },
            el('span', { class: 'chip ' + (a.isDrawing ? 'approved' : 'submitted'), text: scan.kindLabel }),
            el('span', { class: 'chip cat', text: `ודאות ${scan.confidence}%` })),
          el('div', { class: 'confidence-meter' }, el('span', { class: 'cfill', style: `width:${scan.confidence}%;background:${confColor}` })),
          el('div', { class: 'studio-metrics' },
            metric('צפיפות', `${a.complexity}/5`),
            metric('קווי מבנה', `${Math.round(a.hvScore * 100)}%`),
            metric('אלכסונים', `${Math.round(a.diagScore * 100)}%`),
            metric('אזורים', a.zones),
            metric('צבע', `${Math.round(a.colorRatio * 100)}%`)))));

    // Detailed findings.
    const findings = el('div', { class: 'scan-findings' });
    for (const f of scan.findings) {
      findings.appendChild(el('div', { class: 'scan-find' },
        el('span', { class: 'ic', text: f.ok ? '✅' : '⚠️' }), el('span', { text: f.label })));
    }
    analysisCard.appendChild(el('h3', { style: 'margin:0.9rem 0 0.5rem', text: 'ממצאי הסריקה' }));
    analysisCard.appendChild(findings);

    for (const w of scan.warnings) {
      analysisCard.appendChild(el('div', { class: 'scan-warn', style: 'margin-top:0.5rem' }, el('span', { text: '⚠️' }), el('span', { text: w })));
    }

    analysisCard.appendChild(verifyGate(s, scan.mustVerify));
    content.appendChild(analysisCard);
  }

  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'פרופיל הפרויקט' }),
    el('p', { class: 'muted-note', text: 'ערכי ברירת מחדל הוצעו מהניתוח — כוון לפי המבנה בפועל.' }),
    el('div', { class: 'form-grid' },
      field('שם הפרויקט', input('text', s.projectName, (v) => { s.projectName = v; })),
      field('תאריך התחלת ביקורות', input('date', s.startDate, (v) => { s.startDate = v; })),
      field('מספר קומות', numInput(s.floors, 1, 60, (v) => { s.floors = v; })),
      field('דירות בקומה', numInput(s.apartmentsPerFloor, 1, 20, (v) => { s.apartmentsPerFloor = v; })),
      checkboxField('מעלית בבניין', s.hasElevator, (v) => { s.hasElevator = v; }),
      checkboxField('ממ"ד בכל דירה', s.hasMamad, (v) => { s.hasMamad = v; }),
      checkboxField('גג לבדיקה', s.hasRoof, (v) => { s.hasRoof = v; }))));

  const catCard = el('div', { class: 'card' },
    el('h3', { text: 'תחומי ביקורת בתוכנית' }),
    el('div', { class: 'cat-toggle-grid' },
      db.categories.map((c) => {
        const on = s.categoryIds.includes(c.id);
        return el('button', {
          class: 'cat-toggle' + (on ? ' on' : ''),
          onclick: () => {
            s.categoryIds = on ? s.categoryIds.filter((x) => x !== c.id) : [...s.categoryIds, c.id];
            render();
          },
          html: `<span class="ct-ic">${c.icon}</span><span>${c.name}</span><span class="ct-check">${on ? '✓' : ''}</span>`,
        });
      })));
  content.appendChild(catCard);

  const needsVerify = Boolean(s.scan || s.docReview) && !s.verified;
  content.appendChild(el('div', { class: 'btn-row' },
    el('button', { class: 'btn', text: '⚙️ צור תוכנית ביקורת', disabled: s.categoryIds.length === 0 || needsVerify, onclick: generateProgram }),
    el('button', { class: 'btn secondary', text: 'התחל מחדש', onclick: () => { ui.studio = null; render(); } })));
  if (needsVerify) content.appendChild(el('p', { class: 'hint-warn', text: 'סמן את אישור האימות הידני כדי להמשיך.' }));
}

function metric(label, value) {
  return el('div', { class: 'studio-metric' }, el('div', { class: 'mv num', text: value }), el('div', { class: 'ml', text: label }));
}

function numInput(value, min, max, oninput) {
  return el('input', {
    type: 'number', value, min, max, step: 1, inputMode: 'numeric',
    oninput: (e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) oninput(Math.max(min, Math.min(max, n))); },
  });
}

function checkboxField(label, checked, onchange) {
  const box = el('input', { type: 'checkbox', onchange: (e) => onchange(e.target.checked) });
  box.checked = checked;
  const wrap = el('label', { class: 'checkbox-field' }, box, el('span', { text: label }));
  return el('div', { class: 'field' }, wrap);
}

function generateProgram() {
  const s = ui.studio;
  try {
    const { proposals, capped, totalBeforeCap } = buildProgram(db, s);
    s.proposals = proposals;
    s.capped = capped;
    s.totalBeforeCap = totalBeforeCap;
    s.step = 'program';
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderStudioProgram(content) {
  const s = ui.studio;
  content.appendChild(el('div', { class: 'btn-row' },
    el('button', { class: 'btn secondary small', text: '→ חזרה לפרופיל', onclick: () => { s.step = 'profile'; render(); } }),
    el('button', { class: 'btn secondary small', text: '↺ העלה קובץ אחר', onclick: () => { ui.studio = null; render(); } })));
  content.appendChild(el('h2', { class: 'page-title', text: `תוכנית ביקורת — ${s.projectName}` }));

  // Preview which proposals have a matching worker and which will be skipped.
  const withMatch = s.proposals.map((p) => ({
    ...p,
    matched: p.roleId ? resolveAssignees(db, currentUser.companyId, { roleId: p.roleId }).length : 0,
  }));
  const sendable = withMatch.filter((p) => p.matched > 0).length;

  content.appendChild(el('p', { class: 'page-sub', text: `${s.proposals.length} משימות תוזמנו לפי שלבי הביצוע. ${sendable} ניתנות לשיגור מיידי (יש עובד מתאים); השאר ידולגו עד שיירשם עובד בתפקיד.` }));
  if (s.capped) content.appendChild(el('div', { class: 'card', style: 'border-color:var(--warn)' }, el('p', { class: 'hint-warn', text: `⚠️ נוצרו ${s.totalBeforeCap} משימות — מוצגות ומשוגרות ${s.proposals.length} הראשונות. צמצם תחומים או קומות לתוכנית ממוקדת יותר.` })));

  // Group by execution date for a phased view.
  const byDate = new Map();
  for (const p of withMatch) {
    if (!byDate.has(p.execDate)) byDate.set(p.execDate, []);
    byDate.get(p.execDate).push(p);
  }
  for (const [date, group] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const card = el('div', { class: 'card' }, el('h3', { html: `🗓 ${fmtDate(date)} <span class="muted-note">(${group.length} משימות)</span>` }));
    for (const p of group) {
      card.appendChild(el('div', { class: 'assignee-row' },
        el('span', { class: 'chip cat', text: roleById(db, p.roleId)?.name ?? '—' }),
        el('span', { class: 'grow', text: p.title }),
        p.matched > 0
          ? el('span', { class: 'chip approved', text: `${p.matched} עובדים ✓` })
          : el('span', { class: 'chip overdue', text: 'אין עובד' })));
    }
    content.appendChild(card);
  }

  content.appendChild(el('div', { class: 'btn-row' },
    el('button', {
      class: 'btn', text: `🚀 שגר תוכנית — ${sendable} משימות`,
      disabled: sendable === 0,
      onclick: () => tryAction(() => {
        const { project, sent, skipped } = dispatchProgram(db, currentUser, {
          projectName: s.projectName, analysis: s.analysis, proposals: s.proposals,
        }, ctx);
        ui.studio = null;
        ui.tab = 'tasks';
        toast(`התוכנית שוגרה: ${sent.length} משימות נשלחו${skipped.length ? `, ${skipped.length} דולגו` : ''} ✔`);
      }),
    })));
}

boot();
