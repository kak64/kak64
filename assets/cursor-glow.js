// Cursor glow + button press micro-interactions (Home page).
document.addEventListener('mousemove', (e) => {
    const glow = document.getElementById('cursor-glow');
    if (glow) {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
    }
});

document.querySelectorAll('button').forEach((button) => {
    button.addEventListener('mousedown', () => { button.style.transform = 'scale(0.95)'; });
    button.addEventListener('mouseup', () => { button.style.transform = 'scale(1)'; });
    button.addEventListener('mouseleave', () => { button.style.transform = 'scale(1)'; });
});
