import { getElementText } from './queries.js';

export function generateBestSelector(el) {
    if (el.id) {
        return `#${el.id}`;
    }

    if (el.getAttribute('data-testid')) {
        return `[data-testid="${el.getAttribute('data-testid')}"]`;
    }

    if (el.getAttribute('data-cy')) {
        return `[data-cy="${el.getAttribute('data-cy')}"]`;
    }

    if (el.name) {
        return `[name="${el.name}"]`;
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
        return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
    }

    if ((el.tagName === 'AUDIO' || el.tagName === 'VIDEO') && el.dataset.aiRef) {
        return `[data-ai-ref="${el.dataset.aiRef}"]`;
    }

    let selector = el.tagName.toLowerCase();
    if (el.classList.length > 0) {
        const stableClass = Array.from(el.classList).find(
            (className) => /^[a-zA-Z][a-zA-Z0-9_-]{1,}$/.test(className) && !/^(ng-|css-|jsx-|sc-|mat-mdc|hover:|focus:|active:)/.test(className)
        );
        if (stableClass) {
            selector += `.${stableClass}`;
        }
    }

    if (el.parentElement) {
        const siblings = Array.from(el.parentElement.children).filter(
            (sibling) => sibling.tagName === el.tagName
        );
        if (siblings.length > 1) {
            selector += `:nth-of-type(${siblings.indexOf(el) + 1})`;
        }
    }

    return selector;
}

export function buildStableLocator(el) {
    return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        name: el.getAttribute('name') || '',
        role: el.getAttribute('role') || '',
        type: el.getAttribute('type') || '',
        dataTestId: el.getAttribute('data-testid') || '',
        dataCy: el.getAttribute('data-cy') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        placeholder: el.getAttribute('placeholder') || '',
        hrefPart: (el.getAttribute('href') || '').slice(0, 120),
        text: getElementText(el).slice(0, 120),
        classTokens: Array.from(el.classList || [])
            .filter((className) => /^[a-zA-Z0-9_-]{2,}$/.test(className) && !/^(ng-|css-|jsx-|sc-|mat-mdc)/.test(className))
            .slice(0, 3)
    };
}