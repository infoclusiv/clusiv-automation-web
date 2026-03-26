import * as state from '../state.js';

export function buildExportLocators(locator, selector, text, aiRef) {
    const val = (value) => {
        if (typeof value !== 'string') {
            return value || null;
        }

        return value.trim() !== '' ? value : null;
    };

    let primary = null;
    if (locator?.ariaLabel) {
        primary = { strategy: 'aria_label', value: locator.ariaLabel };
    } else if (locator?.dataTestId) {
        primary = { strategy: 'data_testid', value: locator.dataTestId };
    } else if (locator?.dataCy) {
        primary = { strategy: 'data_cy', value: locator.dataCy };
    } else if (locator?.id) {
        primary = { strategy: 'id', value: locator.id };
    } else if (locator?.name) {
        primary = { strategy: 'name', value: locator.name };
    }

    let secondary = null;
    if (locator?.role) {
        secondary = { strategy: 'role', value: locator.role };
    } else if (locator?.dataTestId && primary?.strategy !== 'data_testid') {
        secondary = { strategy: 'data_testid', value: locator.dataTestId };
    }

    const fallback = val(selector)
        ? { strategy: 'css_selector', value: selector }
        : null;

    const textLocator = val(text)
        ? { strategy: 'visible_text', value: text }
        : null;

    let xpath = null;
    if (locator?.ariaLabel) {
        xpath = { strategy: 'xpath', value: `//*[@aria-label="${locator.ariaLabel}"]` };
    } else if (locator?.role) {
        xpath = { strategy: 'xpath', value: `//*[@role="${locator.role}"]` };
    } else if (locator?.id) {
        xpath = { strategy: 'xpath', value: `//*[@id="${locator.id}"]` };
    } else if (val(text)) {
        xpath = { strategy: 'xpath', value: `//*[normalize-space()="${text}"]` };
    }

    const aiRefLocator = val(aiRef)
        ? { strategy: 'ai_ref', value: aiRef }
        : null;

    return {
        primary,
        secondary,
        fallback,
        text: textLocator,
        xpath,
        ai_ref: aiRefLocator
    };
}

export function stepIsPasteText(step) {
    if (step.stepType === 'paste_text') return true;
    if (step.action === 'paste_text') return true;
    if (step.textToPaste || step.text_to_paste) return true;
    if (step.locator?.role === 'textbox') return true;
    if (step.isEditable === true) return true;

    const editableHints = ['textarea', 'input', 'contenteditable', 'textbox', 'searchbox', 'editor'];
    const textLower = (step.text || '').toLowerCase();
    const tagLower = (step.locator?.tag || '').toLowerCase();

    return editableHints.some((hint) => textLower.includes(hint) || tagLower.includes(hint));
}

export function buildExportPayload(journey, tabContext) {
    const now = new Date().toISOString();

    let createdAtIso = journey.createdAt;
    try {
        const parsed = new Date(journey.createdAt);
        if (!Number.isNaN(parsed.getTime())) {
            createdAtIso = parsed.toISOString();
        }
    } catch {
    }

    const steps = (journey.steps || []).map((step, index) => {
        const isKey = step.stepType === 'key_press';
        if (isKey) {
            return {
                index: index + 1,
                action: 'key_press',
                description: `[Tecla] ${step.label || step.key}`,
                key: step.key,
                code: step.code,
                keyCode: step.keyCode,
                modifiers: {
                    ctrlKey: step.ctrlKey || false,
                    shiftKey: step.shiftKey || false,
                    altKey: step.altKey || false
                },
                locators: null,
                element_metadata: null,
                timing: { wait_before_ms: 0, wait_after_ms: 1500 }
            };
        }

        const isWait = step.stepType === 'wait';
        if (isWait) {
            return {
                index: index + 1,
                action: 'wait',
                description: step.label,
                timing: { wait_before_ms: 0, wait_after_ms: step.durationMs },
                locators: null,
                element_metadata: null
            };
        }

        const isPaste = stepIsPasteText(step);
        const locators = buildExportLocators(
            step.locator || null,
            step.selector || '',
            step.text || '',
            step.aiRef || ''
        );

        let resolvedContent = null;
        if (isPaste && step.stepType === 'paste_text' && step.textId) {
            const textRecord = state.savedTexts.find((txt) => txt.id === step.textId);
            resolvedContent = textRecord ? textRecord.content : null;
        }

        return {
            index: index + 1,
            action: isPaste ? 'paste_text' : 'click',
            description: step.stepType === 'paste_text' ? `[Texto] ${step.textName || 'Texto guardado'}` : (step.text || `Paso ${index + 1}`),
            text_to_paste: isPaste ? (resolvedContent || step.textToPaste || step.text_to_paste || null) : null,
            text_ref: step.stepType === 'paste_text'
                ? { id: step.textId || null, name: step.textName || null }
                : null,
            locators,
            element_metadata: {
                tag: step.locator?.tag || '',
                role: step.locator?.role || '',
                type: step.locator?.type || '',
                is_editable: isPaste,
                class_tokens: step.locator?.classTokens || []
            },
            timing: {
                wait_before_ms: isPaste ? 500 : 0,
                wait_after_ms: 1500
            }
        };
    });

    return {
        schema_version: '1.0',
        exported_at: now,
        exported_by: 'Analista Web AI Pro v4.0',
        journey: {
            id: journey.id,
            name: journey.name,
            created_at: createdAtIso,
            step_count: steps.length,
            context: {
                url: tabContext.url || 'unknown',
                origin: tabContext.origin || 'unknown',
                page_title: tabContext.page_title || 'unknown',
                captured_at: now
            },
            steps
        }
    };
}

export async function exportJourneyAsFile(journey) {
    if (!journey) {
        return;
    }

    let tabContext = { url: 'unknown', origin: 'unknown', page_title: 'unknown' };
    try {
        tabContext = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB_CONTEXT' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    resolve({ url: 'unknown', origin: 'unknown', page_title: 'unknown' });
                    return;
                }

                resolve(response);
            });
        });
    } catch (error) {
        console.warn('No se pudo obtener contexto de pestaña:', error);
    }

    const payload = buildExportPayload(journey, tabContext);
    const safeName = String(journey.name || 'journey')
        .replace(/[^a-zA-Z0-9\-_\u00C0-\u024F]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `journey_${safeName}_${dateStr}.json`;

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 5000);
    console.log(`Journey exportado: ${filename}`);
}