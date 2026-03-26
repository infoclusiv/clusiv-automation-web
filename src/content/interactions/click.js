import { findTargetElement } from '../dom/locators.js';

export function simulateHumanClick(el) {
    el.focus();
    ['mousedown', 'mouseup', 'click'].forEach((eventType) => {
        const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        });
        el.dispatchEvent(event);
    });
}

export async function clickWithRetries(request, maxAttempts = 8) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const element = findTargetElement(request);
        if (element) {
            return element;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
}