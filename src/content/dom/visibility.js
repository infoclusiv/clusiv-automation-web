import { EDITABLE_QUERY } from '../constants.js';
import { getDeepActiveElement } from './queries.js';

export let lastFocusedEditable = null;

export function setLastFocusedEditable(el) {
    lastFocusedEditable = el;
}

export function isVisibleElement(el) {
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
        return true;
    }

    if (el.isContentEditable === true) {
        return true;
    }

    if (el.getAttribute('role') === 'textbox') {
        return true;
    }

    if (el.offsetWidth > 0 || el.offsetHeight > 0) {
        return true;
    }

    const overlay = el.closest(
        '.cdk-overlay-pane, [popover], .cdk-overlay-container, ' +
        '.mat-mdc-select-panel, .mat-mdc-autocomplete-panel, ' +
        '.dropdown-menu.show, .popover.show, .modal.show'
    );
    if (overlay) {
        return true;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }

    if (el.hasAttribute('aria-selected') || el.hasAttribute('aria-expanded')) {
        return true;
    }

    return false;
}

export function isEditableElement(el) {
    if (!el || el.tagName === 'BODY' || el.disabled || el.readOnly) {
        return false;
    }

    if (el.matches?.(EDITABLE_QUERY)) {
        return true;
    }

    return el.isContentEditable === true;
}

export function getEditableText(el) {
    if (!el) {
        return null;
    }

    if (!isEditableElement(el)) {
        return null;
    }

    if (typeof el.value !== 'undefined') {
        return el.value || '';
    }

    if (el.isContentEditable) {
        return el.innerText || '';
    }

    return null;
}

export function findEditableCandidate() {
    const activeEl = getDeepActiveElement();
    if (isEditableElement(activeEl)) {
        return activeEl;
    }

    if (isEditableElement(lastFocusedEditable) && document.contains(lastFocusedEditable)) {
        return lastFocusedEditable;
    }

    const candidates = Array.from(document.querySelectorAll(EDITABLE_QUERY));
    return candidates.find((candidate) => isEditableElement(candidate) && isVisibleElement(candidate)) || null;
}

let focusTrackingRegistered = false;

export function registerFocusTracking() {
    if (focusTrackingRegistered) {
        return;
    }

    document.addEventListener('focusin', (event) => {
        const target = event.target;
        if (isEditableElement(target)) {
            setLastFocusedEditable(target);
        }
    }, true);

    focusTrackingRegistered = true;
}