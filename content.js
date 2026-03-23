// content.js
let autoScanActive = false;
let isRecordingMode = false;
let domObserver = null;
let debounceTimer = null;
let lastFocusedEditable = null;

const INTERACTIVE_QUERY = [
    "button", "a", "input", "select", "textarea", "option",
    "[role='button']", "[role='link']", "[role='option']",
    "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
    "[role='tab']", "[role='switch']", "[role='checkbox']", "[role='radio']",
    "[role='combobox']", "[role='listbox']", "[role='searchbox']",
    "[role='slider']", "[role='spinbutton']", "[role='treeitem']",
    "[tabindex='0']",
    "[role='textbox']",
    "[aria-multiline='true']",
    ".ProseMirror",
    ".btn", ".button",
    ".mat-mdc-option", ".mdc-list-item", ".mat-option",
    ".dropdown-item", ".menu-item",
    "[onclick]", "[ng-click]", "[data-action]",

    // ✅ NUEVO: Elementos de media y reproductores
    "audio",
    "video",
    "[class*='audio']",
    "[class*='player']",
    "[class*='waveform']",
    "[class*='speech']",
    ".wavesurfer-wrapper",
    "wave"
].join(", ");

const EDITABLE_QUERY = [
    "textarea",
    "input:not([type='button']):not([type='checkbox']):not([type='color']):not([type='file']):not([type='hidden']):not([type='image']):not([type='radio']):not([type='range']):not([type='reset']):not([type='submit'])",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[role='textbox']",
    "[role='searchbox']"
].join(", ");

// --- UTILIDADES ---
function debounce(func, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

function getEditableText(el) {
    if (!el) return null;
    if (!isEditableElement(el)) return null;
    if (typeof el.value !== 'undefined') return el.value || "";
    if (el.isContentEditable) return el.innerText || "";
    return null;
}

function getDeepActiveElement(root = document) {
    let el = root.activeElement || null;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

function isEditableElement(el) {
    if (!el || el.tagName === 'BODY' || el.disabled || el.readOnly) return false;
    if (el.matches?.(EDITABLE_QUERY)) return true;
    return el.isContentEditable === true;
}

function findEditableCandidate() {
    const activeEl = getDeepActiveElement();
    if (isEditableElement(activeEl)) return activeEl;
    if (isEditableElement(lastFocusedEditable) && document.contains(lastFocusedEditable)) {
        return lastFocusedEditable;
    }

    const candidates = Array.from(document.querySelectorAll(EDITABLE_QUERY));
    return candidates.find((candidate) => isEditableElement(candidate) && isVisibleElement(candidate)) || null;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function countTextOccurrences(value, text) {
    if (!value || !text) return 0;

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

function isComplexRichTextEditor(el) {
    if (!el) return false;
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

function didTextInsertionSucceed(beforeValue, afterValue, text, element = null) {
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

function insertTextIntoElement(el, text) {
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
                } catch (e) { }

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
        } catch (e) { }

        if (!success) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                success = true;
            } else {
                el.innerText = `${el.innerText || ""}${text}`;
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
    } catch (e) { }

    if (!success) {
        if (typeof el.setRangeText === 'function' && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.setRangeText(text, start, end, 'end');
            success = true;
        } else if (typeof el.value !== 'undefined') {
            el.value = `${el.value || ""}${text}`;
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
                el.innerText = `${el.innerText || ""}${text}`;
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

async function pasteTextWithRetries(text, attempts = 6, delayMs = 250) {
    let lastFailure = "No active element";
    let insertedElement = null;
    let beforeValue = null;
    let inserted = false;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!inserted) {
            const el = findEditableCandidate();
            if (!el) {
                lastFailure = "No active element";
                await wait(delayMs);
                continue;
            }

            beforeValue = getEditableText(el);
            if (beforeValue === null) {
                lastFailure = "Active element is not editable";
                await wait(delayMs);
                continue;
            }

            inserted = insertTextIntoElement(el, text);
            insertedElement = el;

            if (!inserted) {
                lastFailure = "Text could not be inserted into the active element";
                return { status: "error", message: lastFailure };
            }

            await wait(isComplexRichTextEditor(el) ? 150 : 50);
        }

        const validationElement = insertedElement && document.contains(insertedElement)
            ? insertedElement
            : findEditableCandidate();

        const afterValue = getEditableText(validationElement);
        if (afterValue === null) {
            lastFailure = "Active element became unavailable";
            await wait(delayMs);
            continue;
        }

        if (didTextInsertionSucceed(beforeValue, afterValue, text, validationElement)) {
            lastFocusedEditable = validationElement;
            return { status: "pasted" };
        }

        if (inserted && insertedElement && isComplexRichTextEditor(insertedElement)) {
            lastFailure = "Rich text editor validation pending";
            await wait(delayMs * 2);
            continue;
        }

        lastFailure = "Text was not inserted into the expected field";
        await wait(delayMs);
    }

    if (inserted && insertedElement && isComplexRichTextEditor(insertedElement)) {
        lastFocusedEditable = insertedElement;
        return { status: "pasted" };
    }

    return { status: "error", message: lastFailure };
}

const autoAnalyzeAndSync = debounce(() => {
    if (!autoScanActive) return;
    const semanticMap = getSemanticMap();
    chrome.runtime.sendMessage({ action: "AUTO_UPDATE_MAP", map: semanticMap }).catch(() => { });
}, 700);

// ============================================================
// ✅ NUEVO: Detector de audio dinámico con MutationObserver
//    Separado del observer principal para máxima reactividad
// ============================================================
let audioObserver = null;

function startAudioObserver() {
    if (audioObserver) return;

    audioObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue; // solo elementos

                // ¿Es un <audio> directo?
                if (node.tagName === 'AUDIO') {
                    handleNewAudioElement(node);
                    continue;
                }

                // ¿Contiene un <audio> dentro?
                const audioInside = node.querySelector?.('audio');
                if (audioInside) {
                    handleNewAudioElement(audioInside);
                }
            }
        }
    });

    audioObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Se llama cada vez que aparece un <audio> nuevo en el DOM.
 * Notifica al background/sidepanel y agrega data-ai-ref si no tiene.
 */
function handleNewAudioElement(audioEl) {
    // Asignar data-ai-ref si no tiene
    if (!audioEl.dataset.aiRef) {
        audioEl.dataset.aiRef = `ai-audio-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
    }

    // Esperar a que el src esté disponible (puede tardar unos ms en Angular)
    const notifyWhenReady = () => {
        const src = audioEl.src || audioEl.currentSrc || '';
        const isBase64 = src.startsWith('data:audio');
        const isBlob = src.startsWith('blob:');
        const isUrl = src.startsWith('http');

        chrome.runtime.sendMessage({
            action: "AUDIO_DETECTED",
            aiRef: audioEl.dataset.aiRef,
            src: isBase64 ? '[base64 audio]' : src,    // no enviamos el base64 completo
            srcFull: src,                                // ← src real para descarga
            isBase64,
            isBlob,
            isUrl,
            duration: audioEl.duration || null,
            mimeType: src.split(';')[0].replace('data:', '') || 'audio/wav'
        }).catch(() => { });
    };

    // Si ya tiene src, notificar de inmediato
    if (audioEl.src || audioEl.currentSrc) {
        notifyWhenReady();
    } else {
        // Esperar al evento loadedmetadata
        audioEl.addEventListener('loadedmetadata', notifyWhenReady, { once: true });
        // Fallback por si loadedmetadata no dispara
        setTimeout(notifyWhenReady, 800);
    }

    // También re-disparar el autoAnalyzeAndSync para que aparezca en el mapa DOM
    autoAnalyzeAndSync();
}

// Iniciar el detector de audio inmediatamente al cargar el content script
startAudioObserver();


// ============================================================
// ✅ NUEVO: Función para descargar audio base64/blob desde la página
// ============================================================
function downloadAudioFromPage(aiRef, filename) {
    // Buscar por data-ai-ref o simplemente el primer <audio>
    const audioEl = aiRef
        ? document.querySelector(`[data-ai-ref="${aiRef}"]`)
        : document.querySelector('audio');

    if (!audioEl) {
        return { status: "not_found", message: "No se encontró el elemento <audio>" };
    }

    const src = audioEl.src || audioEl.currentSrc;
    if (!src) {
        return { status: "no_src", message: "El elemento audio no tiene src todavía" };
    }

    try {
        const a = document.createElement('a');
        a.href = src;
        a.download = filename || 'audio_generado.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return { status: "download_started", filename: a.download };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

/**
 * ✅ NUEVO: Espera activa hasta que aparezca un <audio> en el DOM.
 * Útil en journeys cuando el audio se genera después de clics.
 */
async function waitForAudioElement(timeoutMs = 15000) {
    // Ya existe
    const existing = document.querySelector('audio');
    if (existing && (existing.src || existing.currentSrc)) {
        return { status: "found", aiRef: existing.dataset.aiRef, src: existing.src };
    }

    return new Promise((resolve) => {
        const deadline = setTimeout(() => {
            obs.disconnect();
            resolve({ status: "timeout", message: "Audio no apareció en el tiempo esperado" });
        }, timeoutMs);

        const obs = new MutationObserver(() => {
            const el = document.querySelector('audio');
            if (el) {
                const checkSrc = () => {
                    const src = el.src || el.currentSrc;
                    if (src) {
                        clearTimeout(deadline);
                        obs.disconnect();
                        resolve({ status: "found", aiRef: el.dataset.aiRef, src });
                    }
                };
                checkSrc();
                if (!el.src) el.addEventListener('loadedmetadata', checkSrc, { once: true });
            }
        });

        obs.observe(document.body, { childList: true, subtree: true });
    });
}


// --- LÓGICA CORE ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "ANALYZE_DOM") {
        const semanticMap = getSemanticMap();
        sendResponse({ map: semanticMap });
    }

    if (request.action === "START_AUTO_SCAN") {
        autoScanActive = true;
        startObserver();
        autoAnalyzeAndSync();
        sendResponse({ status: "auto_scan_started" });
    }

    if (request.action === "STOP_AUTO_SCAN") {
        autoScanActive = false;
        stopObserver();
        sendResponse({ status: "auto_scan_stopped" });
    }

    if (request.action === "START_RECORDING") {
        isRecordingMode = true;
        sendResponse({ status: "recording_started" });
    }

    if (request.action === "STOP_RECORDING") {
        isRecordingMode = false;
        sendResponse({ status: "recording_stopped" });
    }

    if (request.action === "SIMULATE_CLICK") {
        clickWithRetries(request).then((element) => {
            if (element) {
                simulateHumanClick(element);
                sendResponse({ status: "clicked" });
            } else {
                sendResponse({ status: "not_found" });
            }
        }).catch(() => sendResponse({ status: "not_found" }));
    }

    if (request.action === "PASTE_TEXT") {
        pasteTextWithRetries(request.text).then(sendResponse);
    }

    if (request.action === "SIMULATE_KEY") {
        const result = simulateKeyPress({
            key: request.key,
            code: request.code,
            keyCode: request.keyCode,
            ctrlKey: request.ctrlKey || false,
            shiftKey: request.shiftKey || false,
            altKey: request.altKey || false
        });
        sendResponse(result);
    }

    if (request.action === 'VALIDATE_EXECUTION_PLAN') {
        const steps = Array.isArray(request.steps) ? request.steps : [];
        const validations = steps.map((step, index) => ({
            stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : index,
            stepType: step.stepType || 'click',
            ...validateExecutionStep(step)
        }));
        const hasErrors = validations.some((validation) => validation.status !== 'ok');

        sendResponse({
            status: hasErrors ? 'error' : 'ok',
            siteReady: !hasErrors,
            page: {
                url: window.location.href,
                title: document.title
            },
            steps: validations
        });
        return true;
    }

    // ✅ NUEVO: Control directo de audio (play/pause/stop)
    if (request.action === "CONTROL_AUDIO") {
        const audioEl = request.aiRef
            ? document.querySelector(`[data-ai-ref="${request.aiRef}"]`)
            : document.querySelector('audio');

        if (!audioEl) {
            sendResponse({ status: "not_found", message: "No hay elemento <audio> en el DOM" });
            return true;
        }

        if (request.command === "play") {
            audioEl.play()
                .then(() => sendResponse({ status: "playing" }))
                .catch(e => sendResponse({ status: "error", message: e.message }));
            return true;
        }

        if (request.command === "pause") {
            audioEl.pause();
            sendResponse({ status: "paused", currentTime: audioEl.currentTime });
            return true;
        }

        if (request.command === "stop") {
            audioEl.pause();
            audioEl.currentTime = 0;
            sendResponse({ status: "stopped" });
            return true;
        }

        if (request.command === "get_info") {
            const src = audioEl.src || audioEl.currentSrc || '';
            sendResponse({
                status: "ok",
                aiRef: audioEl.dataset.aiRef,
                duration: audioEl.duration,
                currentTime: audioEl.currentTime,
                paused: audioEl.paused,
                ended: audioEl.ended,
                isBase64: src.startsWith('data:audio'),
                isBlob: src.startsWith('blob:'),
                mimeType: src.startsWith('data:') ? src.split(';')[0].replace('data:', '') : 'unknown'
            });
            return true;
        }

        // Esperar a que el audio termine de reproducirse
        if (request.command === "wait_end") {
            if (audioEl.ended) {
                sendResponse({ status: "already_ended" });
                return true;
            }
            audioEl.addEventListener('ended', () => {
                sendResponse({ status: "ended" });
            }, { once: true });
            // Timeout de seguridad: máx 5 minutos
            setTimeout(() => sendResponse({ status: "timeout" }), 300000);
            return true; // respuesta asíncrona
        }
    }

    // ✅ NUEVO: Descargar el audio generado (funciona con base64 y blob)
    if (request.action === "DOWNLOAD_AUDIO") {
        const result = downloadAudioFromPage(request.aiRef, request.filename);
        sendResponse(result);
        return true;
    }

    // ✅ NUEVO: Esperar activamente a que aparezca el <audio> en el DOM
    if (request.action === "WAIT_FOR_AUDIO") {
        waitForAudioElement(request.timeoutMs || 15000).then(sendResponse);
        return true;
    }

    // ✅ NUEVO: Obtener el src completo del audio (para descarga externa)
    if (request.action === "GET_AUDIO_SRC") {
        const audioEl = request.aiRef
            ? document.querySelector(`[data-ai-ref="${request.aiRef}"]`)
            : document.querySelector('audio');

        if (!audioEl) {
            sendResponse({ status: "not_found" });
            return true;
        }

        const src = audioEl.src || audioEl.currentSrc || '';
        sendResponse({
            status: "ok",
            src,
            isBase64: src.startsWith('data:audio'),
            isBlob: src.startsWith('blob:'),
            aiRef: audioEl.dataset.aiRef,
            duration: audioEl.duration
        });
        return true;
    }

    return true;
});


// Listener global de clics para grabación
document.addEventListener('click', (event) => {
    if (!isRecordingMode) return;

    const el = event.target.closest(INTERACTIVE_QUERY);

    if (el && isVisibleElement(el)) {
        let refId = el.dataset.aiRef;
        if (!refId) {
            refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
            el.dataset.aiRef = refId;
        }

        const text = (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || "Elemento").replace(/\s+/g, ' ').trim().slice(0, 50);
        const selector = generateBestSelector(el);

        chrome.runtime.sendMessage({
            action: "RECORD_USER_ACTION",
            data: {
                aiRef: refId,
                text: text,
                selector: selector,
                locator: buildStableLocator(el),
                tagName: el.tagName.toLowerCase(),
                type: el.type || 'clickable'
            }
        }).catch(() => { });
    }
}, true);

document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (isEditableElement(target)) {
        lastFocusedEditable = target;
    }
}, true);

function simulateHumanClick(el) {
    el.focus();
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        const event = new MouseEvent(eventType, {
            view: window, bubbles: true, cancelable: true, buttons: 1
        });
        el.dispatchEvent(event);
    });
}

/**
 * Simula la pulsación completa de una tecla (keydown + keypress + keyup)
 * sobre el elemento activo o el documento.
 */
function simulateKeyPress({ key, code, keyCode, ctrlKey = false, shiftKey = false, altKey = false }) {
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
    ['keydown', 'keypress', 'keyup'].forEach(type => {
        target.dispatchEvent(new KeyboardEvent(type, init));
    });
    return { status: 'key_simulated', key };
}

// ============================================================
// ✅ MODIFICADO: isVisibleElement ahora acepta <audio> y <video>
// ============================================================
function isVisibleElement(el) {
    // Los elementos de media son siempre válidos aunque sean "invisibles"
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') return true;

    if (el.isContentEditable === true) return true;
    if (el.getAttribute('role') === 'textbox') return true;

    // Aceptar si tiene dimensiones directas
    if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;

    // Aceptar si está dentro de un overlay/popover activo
    const overlay = el.closest(
        '.cdk-overlay-pane, [popover], .cdk-overlay-container, ' +
        '.mat-mdc-select-panel, .mat-mdc-autocomplete-panel, ' +
        '.dropdown-menu.show, .popover.show, .modal.show'
    );
    if (overlay) return true;

    // Verificar computed style
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // Aceptar elementos con aria-selected o aria-expanded
    if (el.hasAttribute('aria-selected') || el.hasAttribute('aria-expanded')) return true;

    return false;
}

// ============================================================
// ✅ MODIFICADO: getSemanticMap ahora incluye contexto de media
// ============================================================
function getSemanticMap() {
    const elements = collectDeepInteractiveElements();
    const groupedData = {};

    elements.forEach(el => {
        if (!isVisibleElement(el)) return;

        let refId = el.dataset.aiRef;
        if (!refId) {
            refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
            el.dataset.aiRef = refId;
        }

        const context = identifyContext(el);

        // ✅ Para <audio>, construir descripción útil
        let elementData;
        if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
            const src = el.src || el.currentSrc || '';
            const srcLabel = src.startsWith('data:audio') ? '[base64 audio]'
                : src.startsWith('blob:') ? '[blob audio]'
                    : src.startsWith('http') ? src.slice(0, 60)
                        : '[sin src]';

            elementData = {
                aiRef: refId,
                tagName: el.tagName.toLowerCase(),
                type: 'media',
                text: `${el.tagName.toLowerCase()} · ${srcLabel}`,
                selector: generateBestSelector(el),
                locator: buildStableLocator(el),
                // ✅ Datos extra para media
                isMedia: true,
                duration: el.duration || null,
                paused: el.paused,
                hasControls: el.hasAttribute('controls')
            };
        } else {
            const isEditor = el.isContentEditable || el.getAttribute('role') === 'textbox';
            const elementType = isEditor ? 'editable' : el.type || 'clickable';
            const elementText = isEditor
                ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.innerText || 'Campo de texto')
                    .replace(/\s+/g, ' ').trim().slice(0, 50)
                : (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || 'Elemento')
                    .replace(/\s+/g, ' ').trim().slice(0, 50);

            elementData = {
                aiRef: refId,
                tagName: el.tagName.toLowerCase(),
                type: elementType,
                text: elementText,
                selector: generateBestSelector(el),
                locator: buildStableLocator(el),
                isEditable: isEditor
            };
        }

        if (!groupedData[context]) groupedData[context] = [];
        groupedData[context].push(elementData);
    });

    return groupedData;
}

// ============================================================
// ✅ MODIFICADO: identifyContext reconoce contextos de media
// ============================================================
function identifyContext(el) {
    // ✅ NUEVO: Detectar reproductores de audio/voz
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
        return '🎵 Reproductor de Media';
    }
    const mediaContainer = el.closest(
        '[class*="speech-prompt-footer-actions-player"], ' +
        '[class*="audio-player"], [class*="media-player"], ' +
        '[class*="player"], [class*="waveform"], ' +
        'ms-speech-prompt, [class*="speech"]'
    );
    if (mediaContainer) return '🎵 Reproductor de Media';

    // Detectar overlays y popovers dinámicos
    const overlay = el.closest('.cdk-overlay-pane, .cdk-overlay-container, [popover]');
    if (overlay) {
        const listbox = el.closest('[role="listbox"]');
        if (listbox) return 'Lista Desplegable (Dropdown)';
        const menu = el.closest('[role="menu"]');
        if (menu) return 'Menú Contextual';
        return 'Overlay / Popover';
    }
    const modal = el.closest('[role="dialog"], .modal, .popup');
    if (modal) return 'Modal / Popup';
    const nav = el.closest('nav, header, .navbar');
    if (nav) return 'Navegación / Header';
    const form = el.closest('form');
    if (form) return `Formulario ${form.id ? `(#${form.id})` : ''}`;
    const footer = el.closest('footer');
    if (footer) return 'Footer';
    return 'Cuerpo Principal';
}

function generateBestSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
    if (el.getAttribute('data-cy')) return `[data-cy="${el.getAttribute('data-cy')}"]`;
    if (el.name) return `[name="${el.name}"]`;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;

    // ✅ NUEVO: Para audio, usar data-ai-ref si ya lo tiene
    if ((el.tagName === 'AUDIO' || el.tagName === 'VIDEO') && el.dataset.aiRef) {
        return `[data-ai-ref="${el.dataset.aiRef}"]`;
    }

    let selector = el.tagName.toLowerCase();
    if (el.classList.length > 0) {
        const firstClass = el.classList[0];
        if (!firstClass.includes(':')) selector += `.${firstClass}`;
    }
    return selector;
}

function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getElementText(el) {
    return normalizeText(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.placeholder || '');
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
    }
    return String(value).replace(/([#.;?+*~':"!^$\[\]()=>|/@])/g, '\\$1');
}

function collectRoots() {
    const roots = [document];
    const seen = new Set([document]);
    const stack = [document];

    while (stack.length) {
        const root = stack.pop();
        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const el of elements) {
            if (el.shadowRoot && !seen.has(el.shadowRoot)) {
                seen.add(el.shadowRoot);
                roots.push(el.shadowRoot);
                stack.push(el.shadowRoot);
            }
        }
    }
    return roots;
}

function querySelectorDeep(selector) {
    if (!selector) return null;
    const roots = collectRoots();
    for (const root of roots) {
        try {
            const match = root.querySelector(selector);
            if (match) return match;
        } catch (e) { }
    }
    return null;
}

function collectDeepInteractiveElements() {
    const roots = collectRoots();
    const found = new Set();
    const list = [];

    for (const root of roots) {
        const matches = root.querySelectorAll(INTERACTIVE_QUERY);
        for (const el of matches) {
            if (!found.has(el)) {
                found.add(el);
                list.push(el);
            }
        }
    }
    return list;
}

function buildStableLocator(el) {
    return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        name: el.getAttribute('name') || '',
        role: el.getAttribute('role') || '',
        type: el.getAttribute('type') || '',
        dataTestId: el.getAttribute('data-testid') || '',
        dataCy: el.getAttribute('data-cy') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        placeholder: el.getAttribute('placeholder') || '',
        hrefPart: (el.getAttribute('href') || '').slice(0, 120),
        text: getElementText(el).slice(0, 120),
        classTokens: Array.from(el.classList || [])
            .filter(c => /^[a-zA-Z0-9_-]{2,}$/.test(c) && !/^(ng-|css-|jsx-|sc-|mat-mdc)/.test(c))
            .slice(0, 3)
    };
}

function scoreCandidate(el, locator) {
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
        const classHits = locator.classTokens.filter(token => el.classList.contains(token)).length;
        score += classHits * 8;
    }

    if (!isVisibleElement(el)) score -= 100;
    return score;
}

function findElementByLocator(locator) {
    if (!locator) return null;

    const candidates = new Set();
    const addBySelector = (selector) => {
        if (!selector) return;
        const roots = collectRoots();
        for (const root of roots) {
            try {
                root.querySelectorAll(selector).forEach(el => candidates.add(el));
            } catch (e) { }
        }
    };

    if (locator.id) addBySelector(`#${cssEscape(locator.id)}`);
    if (locator.dataTestId) addBySelector(`[data-testid="${cssEscape(locator.dataTestId)}"]`);
    if (locator.dataCy) addBySelector(`[data-cy="${cssEscape(locator.dataCy)}"]`);
    if (locator.name) addBySelector(`[name="${cssEscape(locator.name)}"]`);
    if (locator.ariaLabel && locator.tag) addBySelector(`${locator.tag}[aria-label="${cssEscape(locator.ariaLabel)}"]`);
    if (locator.tag) addBySelector(locator.tag);

    if (!candidates.size) {
        collectDeepInteractiveElements().forEach(el => candidates.add(el));
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

function findElementByText(text) {
    const needle = normalizeText(text);
    if (!needle) return null;

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

function findTargetElement(request) {
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

    if (element && !isVisibleElement(element)) return null;
    return element;
}

async function clickWithRetries(request, maxAttempts = 8) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const element = findTargetElement(request);
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
}

function validateExecutionStep(step) {
    if (!step || typeof step !== 'object') {
        return {
            status: 'error',
            code: 'invalid_step',
            message: 'El paso no tiene una estructura valida.'
        };
    }

    if (step.stepType === 'key_press') {
        return {
            status: 'ok',
            code: 'key_ready',
            message: 'La simulacion de teclado esta disponible.'
        };
    }

    if (step.stepType === 'paste_text') {
        const editable = findEditableCandidate();
        if (!editable) {
            return {
                status: 'error',
                code: 'editable_not_found',
                message: 'No se encontro un campo editable listo para insertar texto.'
            };
        }

        return {
            status: 'ok',
            code: 'editable_ready',
            message: 'Se encontro un campo editable para insertar texto.'
        };
    }

    const targetElement = findTargetElement(step);
    if (!targetElement) {
        return {
            status: 'error',
            code: 'target_not_found',
            message: 'No se encontro el elemento del paso en el DOM actual.'
        };
    }

    return {
        status: 'ok',
        code: 'target_ready',
        message: 'El elemento del paso esta disponible en el DOM.'
    };
}

// ============================================================
// ✅ MODIFICADO: startObserver también observa atributos de audio
// ============================================================
function startObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
        const meaningfulChange = mutations.some(m =>
            m.addedNodes.length > 0 || m.removedNodes.length > 0 || m.type === 'attributes'
        );
        if (meaningfulChange) autoAnalyzeAndSync();
    });
    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden', 'popover', 'src']
    });
}

function stopObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
}