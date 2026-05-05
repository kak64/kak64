// Smooth scroll for in-page anchors
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  const t = document.getElementById(id);
  if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});

// Auto-dismiss flash messages
setTimeout(() => {
  document.querySelectorAll('.flash').forEach(f => {
    f.style.transition = 'opacity .4s, transform .4s';
    f.style.opacity = '0';
    f.style.transform = 'translateY(-8px)';
    setTimeout(() => f.remove(), 400);
  });
}, 4500);

// Confirm before destructive forms
document.querySelectorAll('form[data-confirm]').forEach(f => {
  f.addEventListener('submit', e => {
    if (!confirm(f.dataset.confirm)) e.preventDefault();
  });
});
