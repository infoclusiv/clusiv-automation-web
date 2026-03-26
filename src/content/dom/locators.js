import { collectDeepInteractiveElements, collectRoots, cssEscape, getElementText, normalizeText, querySelectorDeep } from './queries.js';
import { isVisibleElement } from './visibility.js';

export function scoreCandidate(el, locator) {
    let score = 0;
    const elText = getElementText(el);

    if (locator.id && el.id === locator.id) score += 120;
    if (locator.dataTestId && el.getAttribute('data-testid') === locator.dataTestId) score += 90;
    if (locator.dataCy && el.getAttribute('data-cy') === locator.dataCy) score += 90;
    if (locator.name && el.getAttribute('name') === locator.name) score += 70;
    if (locator.ariaLabel && el.getAttribute('aria-label') === locator.ariaLabel) score += 60;
    if (locator.placeholder && el.getAttribute('placeholder') === locator.placeholder) score += 45;
    if (locator.role && el.getAttribute('role') === locator.role) score += 30;
    if (locator.tag && el.tagName.toLowerCase() === locator.tag) score += 25;
    if (locator.type && el.getAttribute('type') === locator.type) score += 15;
    if (locator.hrefPart && (el.getAttribute('href') || '').includes(locator.hrefPart)) score += 20;

    if (locator.text) {
        if (elText === locator.text) score += 80;
        else if (elText.includes(locator.text) || locator.text.includes(elText)) score += 40;
    }

    if (Array.isArray(locator.classTokens) && locator.classTokens.length) {
        const classHits = locator.classTokens.filter((token) => el.classList.contains(token)).length;
        score += classHits * 8;
    }

    if (!isVisibleElement(el)) score -= 100;
    return score;
}

export function findElementByLocator(locator) {
    if (!locator) {
        return null;
    }

    const candidates = new Set();
    const addBySelector = (selector) => {
        if (!selector) {
            return;
        }

        const roots = collectRoots();
        for (const root of roots) {
            try {
                root.querySelectorAll(selector).forEach((el) => candidates.add(el));
            } catch {
            }
        }
    };

    if (locator.id) addBySelector(`#${cssEscape(locator.id)}`);
    if (locator.dataTestId) addBySelector(`[data-testid="${cssEscape(locator.dataTestId)}"]`);
    if (locator.dataCy) addBySelector(`[data-cy="${cssEscape(locator.dataCy)}"]`);
    if (locator.name) addBySelector(`[name="${cssEscape(locator.name)}"]`);
    if (locator.ariaLabel && locator.tag) addBySelector(`${locator.tag}[aria-label="${cssEscape(locator.ariaLabel)}"]`);
    if (locator.tag) addBySelector(locator.tag);

    if (!candidates.size) {
        collectDeepInteractiveElements().forEach((el) => candidates.add(el));
    }

    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
        const score = scoreCandidate(candidate, locator);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return bestScore >= 40 ? best : null;
}

export function findElementByText(text) {
    const needle = normalizeText(text);
    if (!needle) {
        return null;
    }

    const elements = collectDeepInteractiveElements();
    let best = null;
    let bestScore = -Infinity;

    for (const el of elements) {
        if (!isVisibleElement(el)) continue;
        const hay = getElementText(el);
        if (!hay) continue;

        let score = 0;
        if (hay === needle) score = 100;
        else if (hay.includes(needle)) score = 70;
        else if (needle.includes(hay)) score = 40;

        if (score > bestScore) {
            bestScore = score;
            best = el;
        }
    }

    return best;
}

export function findTargetElement(request) {
    let element = null;

    if (request.id) {
        element = querySelectorDeep(`[data-ai-ref="${cssEscape(request.id)}"]`);
    }

    if (!element && request.locator) {
        element = findElementByLocator(request.locator);
    }

    if (!element && request.selector) {
        element = querySelectorDeep(request.selector);
    }

    if (!element && request.text) {
        element = findElementByText(request.text);
    }

    if (element && !isVisibleElement(element)) {
        return null;
    }

    return element;
}