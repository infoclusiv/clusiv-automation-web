import { INTERACTIVE_QUERY } from './constants.js';
import { buildStableLocator, generateBestSelector } from './dom/selectors.js';
import { isVisibleElement } from './dom/visibility.js';

export let isRecordingMode = false;

export function setRecordingMode(value) {
    isRecordingMode = value;
}

let recordingListenersRegistered = false;

export function registerRecordingListeners() {
    if (recordingListenersRegistered) {
        return;
    }

    document.addEventListener('click', (event) => {
        if (!isRecordingMode) {
            return;
        }

        const el = event.target.closest(INTERACTIVE_QUERY);
        if (el && isVisibleElement(el)) {
            let refId = el.dataset.aiRef;
            if (!refId) {
                refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
                el.dataset.aiRef = refId;
            }

            const text = (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || 'Elemento')
                .replace(/\s+/g, ' ').trim().slice(0, 50);
            const selector = generateBestSelector(el);

            chrome.runtime.sendMessage({
                action: 'RECORD_USER_ACTION',
                data: {
                    aiRef: refId,
                    text,
                    selector,
                    locator: buildStableLocator(el),
                    tagName: el.tagName.toLowerCase(),
                    type: el.type || 'clickable'
                }
            }).catch(() => {
            });
        }
    }, true);

    recordingListenersRegistered = true;
}