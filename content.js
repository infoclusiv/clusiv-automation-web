// content.js
let autoScanActive = false;
let domObserver = null;
let debounceTimer = null;

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
    chrome.runtime.sendMessage({ action: "AUTO_UPDATE_MAP", map: semanticMap }).catch(() => {});
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
    if (request.action === "SIMULATE_CLICK") {
        const element = document.querySelector(`[data-ai-ref="${request.id}"]`);
        if (element) {
            simulateHumanClick(element);
            sendResponse({ status: "clicked" });
        } else {
            sendResponse({ status: "not_found" });
        }
    }
    return true;
});

function simulateHumanClick(el) {
    el.focus();
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        const event = new MouseEvent(eventType, {
            view: window, bubbles: true, cancelable: true, buttons: 1
        });
        el.dispatchEvent(event);
    });
}

function getSemanticMap() {
    const query = "button, a, input, select, textarea, [role='button'], [tabindex='0'], .btn, .button";
    const elements = document.querySelectorAll(query);
    const groupedData = {};

    elements.forEach(el => {
        // Ignorar elementos ocultos
        if (el.offsetWidth <= 0 && el.offsetHeight <= 0) return;

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
            selector: generateBestSelector(el)
        };

        if (!groupedData[context]) groupedData[context] = [];
        groupedData[context].push(elementData);
    });

    return groupedData;
}

function identifyContext(el) {
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
    if (el.name) return `[name="${el.name}"]`;
    let selector = el.tagName.toLowerCase();
    if (el.classList.length > 0) {
        const firstClass = el.classList[0];
        if (!firstClass.includes(':')) selector += `.${firstClass}`;
    }
    return selector;
}

function startObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
        // Solo disparar si hay cambios en la estructura de nodos
        const meaningfulChange = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
        if (meaningfulChange) autoAnalyzeAndSync();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
}