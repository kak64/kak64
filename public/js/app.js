// === CSRF auto-injection on every form ===
(function() {
  const meta = document.querySelector('meta[name=csrf-token]');
  const token = meta && meta.getAttribute('content');
  if (!token) return;

  function ensureCsrf(form) {
    if (!form.method || !['POST','PUT','DELETE','PATCH'].includes(form.method.toUpperCase())) return;
    if (form.querySelector('input[name=_csrf]')) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = '_csrf';
    input.value = token;
    form.appendChild(input);
  }

  function processAll() {
    document.querySelectorAll('form').forEach(ensureCsrf);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processAll);
  } else {
    processAll();
  }

  document.addEventListener('submit', function(e) {
    if (e.target instanceof HTMLFormElement) ensureCsrf(e.target);
  }, true);
})();

// === Theme toggle (dark / light / auto) ===
(function() {
  const KEY = 'futureil-theme';
  function apply(theme) {
    let actual = theme;
    if (theme === 'auto') {
      actual = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', actual);
  }
  const saved = localStorage.getItem(KEY) || 'dark';
  apply(saved);

  document.addEventListener('click', function(e) {
    const toggle = e.target.closest('#theme-toggle');
    if (toggle) {
      const current = localStorage.getItem(KEY) || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
      return;
    }
    const pick = e.target.closest('.theme-pick');
    if (pick) {
      localStorage.setItem(KEY, pick.dataset.theme);
      apply(pick.dataset.theme);
    }
  });
})();

// === User dropdown menu ===
document.addEventListener('click', function(e) {
  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;
  if (e.target.closest('.avatar-btn')) {
    userMenu.classList.toggle('open');
    e.stopPropagation();
  } else if (!e.target.closest('.user-dropdown')) {
    userMenu.classList.remove('open');
  }
});

// === Copy / reveal buttons (server connection details, tokens) ===
document.addEventListener('click', function(e) {
  const copyBtn = e.target.closest('.btn-copy');
  if (copyBtn) {
    e.preventDefault();
    const targetId = copyBtn.dataset.copy;
    const target = document.getElementById(targetId);
    if (!target) return;
    const text = (copyBtn.dataset.secret && target.dataset.secret) ? target.dataset.secret : target.textContent;
    navigator.clipboard.writeText(text.trim()).then(function() {
      const original = copyBtn.textContent;
      copyBtn.textContent = '✓';
      copyBtn.classList.add('copied');
      setTimeout(function() {
        copyBtn.textContent = original;
        copyBtn.classList.remove('copied');
      }, 1200);
    }).catch(function() {
      alert('לא ניתן להעתיק - העתק ידנית');
    });
    return;
  }

  const revealBtn = e.target.closest('.btn-reveal');
  if (revealBtn) {
    e.preventDefault();
    const targetId = revealBtn.dataset.reveal;
    const target = document.getElementById(targetId);
    if (!target) return;
    if (target.classList.contains('masked')) {
      target.textContent = target.dataset.secret;
      target.classList.remove('masked');
      revealBtn.textContent = '🙈';
    } else {
      target.textContent = '••••••••••';
      target.classList.add('masked');
      revealBtn.textContent = '👁';
    }
  }
});

// === Animated counters (stats section) ===
(function() {
  const nums = document.querySelectorAll('.stat-num[data-count]');
  if (!nums.length || typeof IntersectionObserver === 'undefined') return;

  function animate(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const duration = 1500;
    const start = performance.now();
    const isFloat = target % 1 !== 0;

    function step(t) {
      const elapsed = t - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      el.textContent = (isFloat ? current.toFixed(1) : Math.floor(current)) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
    }
    requestAnimationFrame(step);
  }

  const obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        animate(e.target);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: .3 });
  nums.forEach(function(n) { obs.observe(n); });
})();

// === Reveal sections on scroll ===
(function() {
  if (typeof IntersectionObserver === 'undefined') return;
  const targets = document.querySelectorAll('.features-section, .usecases-section, .plans-section, .testimonials-section, .faq-section, .cta-section');
  targets.forEach(function(t) { t.classList.add('reveal'); });
  const obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: .1, rootMargin: '0px 0px -50px 0px' });
  targets.forEach(function(t) { obs.observe(t); });
})();

// === Live clock (footer) ===
(function() {
  const el = document.getElementById('clock');
  if (!el) return;
  function tick() {
    try {
      const now = new Date().toLocaleString('en-IL', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      el.textContent = now;
    } catch (e) {
      el.textContent = new Date().toLocaleString();
    }
  }
  tick();
  setInterval(tick, 30000);
})();
