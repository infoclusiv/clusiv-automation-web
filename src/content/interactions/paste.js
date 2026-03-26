import { findEditableCandidate, getEditableText, isEditableElement, setLastFocusedEditable } from '../dom/visibility.js';

export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function countTextOccurrences(value, text) {
    if (!value || !text) {
        return 0;
    }

    let count = 0;
    let searchIndex = 0;

    while (true) {
        const matchIndex = value.indexOf(text, searchIndex);
        if (matchIndex === -1) {
            return count;
        }

        count += 1;
        searchIndex = matchIndex + text.length;
    }
}

export function isComplexRichTextEditor(el) {
    if (!el) {
        return false;
    }

    if (el.classList?.contains('ProseMirror')) return true;
    if (el.classList?.contains('ql-editor')) return true;
    if (el.closest?.('.tiptap')) return true;
    if (el.closest?.('.DraftEditor-root')) return true;
    if (el.closest?.('[data-lexical-editor]')) return true;

    if (el.isContentEditable && el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') {
        return el.querySelector('p, div > span, [data-block]') !== null;
    }

    return false;
}

export function didTextInsertionSucceed(beforeValue, afterValue, text, element = null) {
    if (element && isComplexRichTextEditor(element)) {
        return typeof afterValue === 'string';
    }

    if (typeof afterValue !== 'string') {
        return false;
    }

    if (afterValue === beforeValue) {
        return false;
    }

    const beforeCount = countTextOccurrences(beforeValue || '', text);
    const afterCount = countTextOccurrences(afterValue, text);

    if (afterCount > beforeCount) {
        return true;
    }

    return afterValue.includes(text);
}

export function insertTextIntoElement(el, text) {
    el.focus({ preventScroll: false });

    let success = false;

    if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
        if (isComplexRichTextEditor(el)) {
            const selection = window.getSelection();
            if (selection) {
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            const beforeInputEvt = new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: text
            });
            const shouldContinue = el.dispatchEvent(beforeInputEvt);

            if (shouldContinue) {
                try {
                    success = document.execCommand('insertText', false, text);
                } catch {
                }

                if (!success) {
                    const richSelection = window.getSelection();
                    if (richSelection && richSelection.rangeCount > 0) {
                        const range = richSelection.getRangeAt(0);
                        range.deleteContents();
                        const textNode = document.createTextNode(text);
                        range.insertNode(textNode);
                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);
                        richSelection.removeAllRanges();
                        richSelection.addRange(range);
                        success = true;
                    }
                }
            }

            if (success) {
                el.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: false,
                    inputType: 'insertText',
                    data: text
                }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            return success;
        }

        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        const beforeInputEvt = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
        });
        el.dispatchEvent(beforeInputEvt);

        try {
            success = document.execCommand('insertText', false, text);
        } catch {
        }

        if (!success) {
            const selectionRange = window.getSelection();
            if (selectionRange && selectionRange.rangeCount > 0) {
                const range = selectionRange.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                selectionRange.removeAllRanges();
                selectionRange.addRange(range);
                success = true;
            } else {
                el.innerText = `${el.innerText || ''}${text}`;
                success = true;
            }
        }

        if (success) {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return success;
    }

    try {
        success = document.execCommand('insertText', false, text);
    } catch {
    }

    if (!success) {
        if (typeof el.setRangeText === 'function' && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.setRangeText(text, start, end, 'end');
            success = true;
        } else if (typeof el.value !== 'undefined') {
            el.value = `${el.value || ''}${text}`;
            success = true;
        } else if (el.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                el.innerText = `${el.innerText || ''}${text}`;
            }
            success = true;
        }
    }

    if (success) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return success;
}

export async function pasteTextWithRetries(text, attempts = 6, delayMs = 250) {
    let lastFailure = 'No active element';
    let insertedElement = null;
    let beforeValue = null;
    let inserted = false;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!inserted) {
            const el = findEditableCandidate();
            if (!el) {
                lastFailure = 'No active element';
                await wait(delayMs);
                continue;
            }

            beforeValue = getEditableText(el);
            if (beforeValue === null) {
                lastFailure = 'Active element is not editable';
                await wait(delayMs);
                continue;
            }

            inserted = insertTextIntoElement(el, text);
            insertedElement = el;

            if (!inserted) {
                lastFailure = 'Text could not be inserted into the active element';
                return { status: 'error', message: lastFailure };
            }

            await wait(isComplexRichTextEditor(el) ? 150 : 50);
        }

        const validationElement = insertedElement && document.contains(insertedElement)
            ? insertedElement
            : findEditableCandidate();

        const afterValue = getEditableText(validationElement);
        if (afterValue === null) {
            lastFailure = 'Active element became unavailable';
            await wait(delayMs);
            continue;
        }

        if (didTextInsertionSucceed(beforeValue, afterValue, text, validationElement)) {
            setLastFocusedEditable(validationElement);
            return { status: 'pasted' };
        }

        if (inserted && insertedElement && isComplexRichTextEditor(insertedElement)) {
            lastFailure = 'Rich text editor validation pending';
            await wait(delayMs * 2);
            continue;
        }

        lastFailure = 'Text was not inserted into the expected field';
        await wait(delayMs);
    }

    if (inserted && insertedElement && isComplexRichTextEditor(insertedElement)) {
        setLastFocusedEditable(insertedElement);
        return { status: 'pasted' };
    }

    return { status: 'error', message: lastFailure };
}