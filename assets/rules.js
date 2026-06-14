// Rules page: accordion + sidebar scroll-spy navigation.
function toggleAccordion(button) {
    const item = button.parentElement;
    const isActive = item.classList.contains('accordion-active');

    document.querySelectorAll('.accordion-item').forEach((el) => {
        el.classList.remove('accordion-active');
    });

    if (!isActive) {
        item.classList.add('accordion-active');
    }
}

function scrollToSection(id) {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }

    document.querySelectorAll('aside button').forEach((btn) => {
        btn.classList.remove('bg-primary-container', 'text-on-primary-container', 'font-bold');
        btn.classList.add('hover:bg-surface-container-high', 'text-on-surface-variant');
    });

    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('bg-primary-container', 'text-on-primary-container', 'font-bold');
        window.event.currentTarget.classList.remove('hover:bg-surface-container-high', 'text-on-surface-variant');
    }
}

// Open the first accordion by default.
document.addEventListener('DOMContentLoaded', () => {
    const first = document.querySelector('.accordion-item');
    if (first) first.classList.add('accordion-active');
});
