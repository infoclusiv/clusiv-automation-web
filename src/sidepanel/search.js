import { refs } from './dom-refs.js';

export function initSearch() {
    refs.searchInput.addEventListener('input', () => {
        const query = refs.searchInput.value.toLowerCase().trim();
        const items = refs.consoleLog.querySelectorAll('.item');
        const sections = refs.consoleLog.querySelectorAll('.section-header');

        items.forEach((item) => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query) ? '' : 'none';
        });

        sections.forEach((section) => {
            let next = section.nextElementSibling;
            let hasVisible = false;
            while (next && !next.classList.contains('section-header')) {
                if (next.classList.contains('item') && next.style.display !== 'none') {
                    hasVisible = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            section.style.display = hasVisible ? '' : 'none';
        });
    });
}