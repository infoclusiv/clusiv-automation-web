import { getDeepActiveElement } from '../dom/queries.js';
import { isEditableElement, lastFocusedEditable } from '../dom/visibility.js';

function resolveKeyTarget(targetSelector) {
    if (targetSelector) {
        const targetElement = document.querySelector(targetSelector);
        if (targetElement) {
            return targetElement;
        }
    }

    const activeElement = getDeepActiveElement();

    if (isEditableElement(activeElement)) {
        return activeElement;
    }

    if (isEditableElement(lastFocusedEditable) && document.contains(lastFocusedEditable)) {
        return lastFocusedEditable;
    }

    return activeElement || document.body;
}

function tryExecCommandFallback(key, ctrlKey, shiftKey, altKey) {
    if (!ctrlKey || shiftKey || altKey || typeof key !== 'string') {
        return;
    }

    const execMap = {
        a: 'selectAll',
        c: 'copy',
        x: 'cut',
        z: 'undo',
        y: 'redo'
    };

    const command = execMap[key.toLowerCase()];
    if (!command) {
        return;
    }

    try {
        document.execCommand(command);
    } catch {
        // Ignore browsers or contexts where execCommand is unavailable.
    }
}

export function simulateKeyPress({
    key,
    code,
    keyCode,
    ctrlKey = false,
    shiftKey = false,
    altKey = false,
    targetSelector = null
}) {
    const target = resolveKeyTarget(targetSelector);

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

    tryExecCommandFallback(key, ctrlKey, shiftKey, altKey);

    return { status: 'key_simulated', key, targetTag: target.tagName?.toLowerCase() || 'unknown' };
}