// Forum page: subtle slide micro-interaction on category rows.
// Slides toward the reading edge (left for LTR, right for RTL).
(function () {
    const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
    const offset = isRtl ? '-4px' : '4px';
    document.querySelectorAll('.category-row').forEach((row) => {
        row.addEventListener('mouseenter', () => { row.style.transform = `translateX(${offset})`; });
        row.addEventListener('mouseleave', () => { row.style.transform = 'translateX(0)'; });
    });
})();
