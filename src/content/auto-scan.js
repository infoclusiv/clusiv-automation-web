import { getSemanticMap } from './dom/semantic-map.js';

export let autoScanActive = false;
let domObserver = null;
let debounceTimer = null;

function debounce(func, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

export const autoAnalyzeAndSync = debounce(() => {
    if (!autoScanActive) {
        return;
    }

    const semanticMap = getSemanticMap();
    chrome.runtime.sendMessage({ action: 'AUTO_UPDATE_MAP', map: semanticMap }).catch(() => {
    });
}, 700);

export function triggerAutoAnalyzeAndSync() {
    autoAnalyzeAndSync();
}

export function startObserver() {
    if (domObserver) {
        return;
    }

    domObserver = new MutationObserver((mutations) => {
        const meaningfulChange = mutations.some((mutation) =>
            mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0 || mutation.type === 'attributes'
        );
        if (meaningfulChange) {
            autoAnalyzeAndSync();
        }
    });

    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden', 'popover', 'src']
    });
}

export function stopObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
}

export function startAutoScan() {
    autoScanActive = true;
    startObserver();
    autoAnalyzeAndSync();
    return { status: 'auto_scan_started' };
}

export function stopAutoScan() {
    autoScanActive = false;
    stopObserver();
    return { status: 'auto_scan_stopped' };
}