import { INTERACTIVE_QUERY } from '../constants.js';

export function getDeepActiveElement(root = document) {
    let el = root.activeElement || null;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

export function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function getElementText(el) {
    return normalizeText(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.placeholder || '');
}

export function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
    }
    return String(value).replace(/([#.;?+*~':"!^$\[\]()=>|/@])/g, '\\$1');
}

export function collectRoots() {
    const roots = [document];
    const seen = new Set([document]);
    const stack = [document];

    while (stack.length) {
        const root = stack.pop();
        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const el of elements) {
            if (el.shadowRoot && !seen.has(el.shadowRoot)) {
                seen.add(el.shadowRoot);
                roots.push(el.shadowRoot);
                stack.push(el.shadowRoot);
            }
        }
    }
    return roots;
}

export function querySelectorDeep(selector) {
    if (!selector) {
        return null;
    }

    const roots = collectRoots();
    for (const root of roots) {
        try {
            const match = root.querySelector(selector);
            if (match) {
                return match;
            }
        } catch {
        }
    }

    return null;
}

export function collectDeepInteractiveElements() {
    const roots = collectRoots();
    const found = new Set();
    const list = [];

    for (const root of roots) {
        const matches = root.querySelectorAll(INTERACTIVE_QUERY);
        for (const el of matches) {
            if (!found.has(el)) {
                found.add(el);
                list.push(el);
            }
        }
    }

    return list;
}