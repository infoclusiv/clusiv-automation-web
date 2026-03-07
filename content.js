// content.js
let autoScanActive = false;
let isRecordingMode = false;
let domObserver = null;
let debounceTimer = null;

const INTERACTIVE_QUERY = [
    "button", "a", "input", "select", "textarea", "option",
    "[role='button']", "[role='link']", "[role='option']",
    "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
    "[role='tab']", "[role='switch']", "[role='checkbox']", "[role='radio']",
    "[role='combobox']", "[role='listbox']", "[role='searchbox']",
    "[role='slider']", "[role='spinbutton']", "[role='treeitem']",
    "[tabindex='0']",
    ".btn", ".button",
    ".mat-mdc-option", ".mdc-list-item", ".mat-option",
    ".dropdown-item", ".menu-item",
    "[onclick]", "[ng-click]", "[data-action]"
].join(", ");

// --- UTILIDADES ---
function debounce(func, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

const autoAnalyzeAndSync = debounce(() => {
    if (!autoScanActive) return;
    const semanticMap = getSemanticMap();
    chrome.runtime.sendMessage({ action: "AUTO_UPDATE_MAP", map: semanticMap }).catch(() => { });
}, 700);

// --- LÓGICA CORE ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ANALYZE_DOM") {
        const semanticMap = getSemanticMap();
        sendResponse({ map: semanticMap });
    }
    if (request.action === "START_AUTO_SCAN") {
        autoScanActive = true;
        startObserver();
        autoAnalyzeAndSync(); // Escaneo inicial
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
        let el = document.activeElement; 

        // A veces las webs modernas usan shadow DOM (ej. web components), busquemos el elemento real 
        while (el && el.shadowRoot && el.shadowRoot.activeElement) { 
            el = el.shadowRoot.activeElement; 
        } 

        if (el && el.tagName !== 'BODY') { 
            el.focus(); 
            let success = false; 
            
            // Intento 1: API nativa que mantiene el historial de Ctrl+Z y detecta eventos de framework (React/Angular) 
            try { 
                success = document.execCommand('insertText', false, request.text); 
            } catch (e) {} 

            // Fallback: Modificación directa de variables de valor 
            if (!success) { 
                if (typeof el.value !== 'undefined') { // Inputs estándar 
                    el.value = (el.value || "") + request.text; 
                    el.dispatchEvent(new Event('input', { bubbles: true })); 
                    el.dispatchEvent(new Event('change', { bubbles: true })); 
                } else if (el.isContentEditable) { // Cajas enriquecidas 
                    el.innerText = (el.innerText || "") + request.text; 
                    el.dispatchEvent(new Event('input', { bubbles: true })); 
                } 
            } 
            sendResponse({ status: "pasted" }); 
        } else { 
            sendResponse({ status: "error", message: "No active element" }); 
        } 
    }

    return true;
});

// Listener global de clics para grabación
document.addEventListener('click', (event) => {
    if (!isRecordingMode) return;

    const el = event.target.closest(INTERACTIVE_QUERY);

    if (el && isVisibleElement(el)) {
        // Asegurar ID
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

function simulateHumanClick(el) {
    el.focus();
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        const event = new MouseEvent(eventType, {
            view: window, bubbles: true, cancelable: true, buttons: 1
        });
        el.dispatchEvent(event);
    });
}

function isVisibleElement(el) {
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

function getSemanticMap() {
    const elements = collectDeepInteractiveElements();
    const groupedData = {};

    elements.forEach(el => {
        // Ignorar elementos ocultos
        if (!isVisibleElement(el)) return;

        // Generar o recuperar ID único persistente
        let refId = el.dataset.aiRef;
        if (!refId) {
            refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
            el.dataset.aiRef = refId;
        }

        const context = identifyContext(el);
        const elementData = {
            aiRef: refId,
            tagName: el.tagName.toLowerCase(),
            type: el.type || 'clickable',
            text: (el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || "Elemento").replace(/\s+/g, ' ').trim().slice(0, 50),
            selector: generateBestSelector(el),
            locator: buildStableLocator(el)
        };

        if (!groupedData[context]) groupedData[context] = [];
        groupedData[context].push(elementData);
    });

    return groupedData;
}

function identifyContext(el) {
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

function startObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
        // Disparar si hay cambios en nodos O en atributos relevantes (overlays, dropdowns)
        const meaningfulChange = mutations.some(m =>
            m.addedNodes.length > 0 || m.removedNodes.length > 0 || m.type === 'attributes'
        );
        if (meaningfulChange) autoAnalyzeAndSync();
    });
    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden', 'popover']
    });
}

function stopObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
}
