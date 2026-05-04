document.addEventListener('click', function(e) {
  const copyBtn = e.target.closest('.btn-copy');
  if (copyBtn) {
    e.preventDefault();
    const targetId = copyBtn.dataset.copy;
    const target = document.getElementById(targetId);
    if (!target) return;
    const text = copyBtn.dataset.secret ? (target.dataset.secret || target.textContent) : target.textContent;
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
