import { getDeepActiveElement } from '../dom/queries.js';
import { isEditableElement, lastFocusedEditable } from '../dom/visibility.js';

export function simulateKeyPress({ key, code, keyCode, ctrlKey = false, shiftKey = false, altKey = false }) {
    const activeElement = getDeepActiveElement();
    const target = isEditableElement(activeElement)
        ? activeElement
        : (isEditableElement(lastFocusedEditable) && document.contains(lastFocusedEditable)
            ? lastFocusedEditable
            : (activeElement || document.body));

    if (typeof target.focus === 'function') {
        target.focus({ preventScroll: false });
    }

    const init = {
        key,
        code,
        keyCode,
        which: keyCode,
        ctrlKey,
        shiftKey,
        altKey,
        metaKey: false,
        bubbles: true,
        cancelable: true
    };

    ['keydown', 'keypress', 'keyup'].forEach((type) => {
        target.dispatchEvent(new KeyboardEvent(type, init));
    });

    return { status: 'key_simulated', key };
}