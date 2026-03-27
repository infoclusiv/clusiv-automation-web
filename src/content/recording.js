import { INTERACTIVE_QUERY } from './constants.js';
import { buildStableLocator, generateBestSelector } from './dom/selectors.js';
import { isVisibleElement } from './dom/visibility.js';

export let isRecordingMode = false;

export function setRecordingMode(value) {
    isRecordingMode = value;
}

let recordingListenersRegistered = false;

function isValidFallbackTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    if (target === document.body || target === document.documentElement) {
        return false;
    }

    if (target.tagName === 'HTML' || target.tagName === 'BODY') {
        return false;
    }

    return isVisibleElement(target);
}

function extractElementLabel(el) {
    const raw =
        el.innerText ||
        el.placeholder ||
        el.value ||
        el.getAttribute('aria-label') ||
        el.getAttribute('data-placeholder') ||
        el.getAttribute('title') ||
        '';

    const label = raw.replace(/\s+/g, ' ').trim().slice(0, 50);
    if (label) {
        return label;
    }

    const stableClass = Array.from(el.classList || []).find(
        (className) => /^[a-zA-Z][a-zA-Z0-9_-]{2,}$/.test(className) && !/^(ng-|css-|jsx-|sc-)/.test(className)
    );

    if (stableClass) {
        return `.${stableClass}`;
    }

    return `<${el.tagName.toLowerCase()}>`;
}

export function registerRecordingListeners() {
    if (recordingListenersRegistered) {
        return;
    }

    document.addEventListener('click', (event) => {
        if (!isRecordingMode) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        let el = target?.closest(INTERACTIVE_QUERY) || null;

        if (!el && isValidFallbackTarget(target)) {
            el = target;
        }

        if (!el || !isVisibleElement(el)) {
            return;
        }

        let refId = el.dataset.aiRef;
        if (!refId) {
            refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
            el.dataset.aiRef = refId;
        }

        const text = extractElementLabel(el);
        const selector = generateBestSelector(el);

        chrome.runtime.sendMessage({
            action: 'RECORD_USER_ACTION',
            data: {
                aiRef: refId,
                text,
                selector,
                locator: buildStableLocator(el),
                tagName: el.tagName.toLowerCase(),
                type: el.type || el.getAttribute('role') || 'clickable'
            }
        }).catch(() => {
        });
    }, true);

    recordingListenersRegistered = true;
}