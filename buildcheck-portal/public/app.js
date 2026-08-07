// BuildCheck Portal — SPA controller.
// Three panels over one strict core: app admin (companies + branding +
// registries), company manager (workers, dispatch, report review) and
// worker (date-filtered tasks, photo-mandatory checks, cm/m measurements).

import { todayStr, addDaysStr, defaultCtx } from '/core/util.js';
import { roleById, districtById, areaById, categoryById, subcategoryById, addRole, addCategory, addSubcategory } from '/core/directory.js';
import { generateLogo } from '/core/logo.js';
import { authenticate, companyOf, createCompany, createManager, createWorker, setUserActive, regenerateLogo } from '/core/auth.js';
import {
  STATUS, STATUS_LABELS, MEASUREMENT_UNITS, resolveAssignees, dispatchTask,
  tasksForWorker, getAssignment, startAssignment, saveDraft, emptyDraftItem,
  submitReport, approveAssignment, isOverdue, companyTasks, companyStats,
} from '/core/tasks.js';
import { createDb, seedDemo, serializeDb, deserializeDb } from '/core/store.js';

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
  const span = el('span', { class: 'co-logo' });
  span.innerHTML = generateLogo(company.logoSeed, company.name, size);
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
      el('img', { src: ui.lightbox, alt: 'תמונה מוגדלת' }));
    document.body.appendChild(overlay);
  }
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
    { id: 'dispatch', label: 'שליחת משימה' },
    { id: 'tasks', label: 'משימות ודוחות' },
    { id: 'workers', label: 'עובדים' },
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

  app.replaceChildren(topbar, tabs, content);
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
  content.appendChild(el('p', { class: 'page-sub', text: 'כל חברה מקבלת לוגו ייחודי משלה — אפשר להגריל מחדש בכל רגע.' }));

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
          class: 'btn secondary small', text: '🎲 החלף לוגו',
          onclick: () => tryAction(() => { regenerateLogo(db, currentUser, company.id, ctx); toast('לוגו חדש הוגרל לחברה'); }),
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
  if (ui.tab === 'dispatch') return renderManagerDispatch(content);
  if (ui.tab === 'tasks') return renderManagerTasks(content);
  return renderManagerWorkers(content);
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
  content.appendChild(el('h2', { class: 'page-title', text: 'עובדי החברה' }));
  content.appendChild(el('p', { class: 'page-sub', text: 'רושמים רק שם ותפקיד — שם המשתמש והסיסמה נוצרים אוטומטית ומוצגים פעם אחת.' }));

  const workers = db.users.filter((u) => u.kind === 'worker' && u.companyId === currentUser.companyId);
  const grid = el('div', { class: 'cards-grid' });
  for (const w of workers) {
    const role = roleById(db, w.roleId);
    const district = districtById(db, w.districtId);
    const area = areaById(db, w.districtId, w.areaId);
    grid.appendChild(el('div', { class: 'card task-card' + (w.active ? '' : ' inactive') },
      el('div', { class: 'head' },
        el('span', { class: 't', text: w.name }),
        el('span', { class: 'chip cat', text: role?.name ?? '—' }),
        w.active ? null : el('span', { class: 'chip overdue', text: 'מושבת' })),
      el('div', { class: 'meta' },
        el('span', { text: `🗺 ${district?.name ?? 'ללא מחוז'}${area ? ' · ' + area.name : ''}` }),
        el('span', { class: 'num', text: `👤 ${w.username}` })),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn secondary small',
          text: w.active ? 'השבת' : 'הפעל מחדש',
          onclick: () => tryAction(() => setUserActive(db, currentUser, w.id, !w.active)),
        }))));
  }
  content.appendChild(grid);

  const nameInput = el('input', { type: 'text', placeholder: 'למשל: אבי שלום' });
  const roleSelect = select(db.roles[0].id, db.roles.map((r) => [r.id, r.name]), () => {});
  const districtSelect = el('select', {},
    el('option', { value: '', text: 'ללא מחוז' }),
    db.districts.map((x) => el('option', { value: x.id, text: x.name })));
  const areaSelect = el('select', {}, el('option', { value: '', text: 'ללא אזור' }));
  districtSelect.onchange = () => {
    areaSelect.replaceChildren(el('option', { value: '', text: 'ללא אזור' }));
    const dist = districtById(db, districtSelect.value);
    if (dist) for (const a of dist.areas) areaSelect.appendChild(el('option', { value: a.id, text: a.name }));
  };

  content.appendChild(el('div', { class: 'card' },
    el('h3', { text: 'רישום עובד חדש' }),
    el('div', { class: 'form-grid' },
      field('שם העובד', nameInput),
      field('תפקיד (מהרשומים באפליקציה)', roleSelect),
      field('מחוז', districtSelect),
      field('אזור', areaSelect)),
    el('div', { class: 'btn-row', style: 'margin-top:0.7rem' },
      el('button', {
        class: 'btn', text: 'צור עובד + פרטי התחברות',
        onclick: () => tryAction(() => {
          const { user, credentials } = createWorker(db, currentUser, {
            name: nameInput.value,
            roleId: roleSelect.value,
            districtId: districtSelect.value || undefined,
            areaId: areaSelect.value || undefined,
          }, ctx);
          ui.modal = { title: 'עובד נרשם בהצלחה', name: user.name, ...credentials };
        }),
      }))));
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
    el('button', { class: 'btn secondary small', text: '→ חזרה', onclick: () => { ui.reportView = null; render(); } })));
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

  if (manager && assignment.status === STATUS.SUBMITTED) {
    content.appendChild(el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn', text: 'אשר דוח ✔',
        onclick: () => tryAction(() => {
          approveAssignment(db, currentUser, task.id, workerId, ctx);
          ui.reportView = null;
          toast('הדוח אושר');
        }),
      })));
  }
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

boot();
