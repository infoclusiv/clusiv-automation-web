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
    const query = [
        // Elementos HTML nativos
        "button", "a", "input", "select", "textarea", "option",
        // Roles ARIA interactivos
        "[role='button']", "[role='link']", "[role='option']",
        "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
        "[role='tab']", "[role='switch']", "[role='checkbox']", "[role='radio']",
        "[role='combobox']", "[role='listbox']", "[role='searchbox']",
        "[role='slider']", "[role='spinbutton']", "[role='treeitem']",
        // Tabindex interactivos
        "[tabindex='0']",
        // Clases comunes de frameworks (Angular Material, Bootstrap, etc.)
        ".btn", ".button",
        ".mat-mdc-option", ".mdc-list-item", ".mat-option",
        ".dropdown-item", ".menu-item",
        // Elementos clickeables por atributo
        "[onclick]", "[ng-click]", "[data-action]"
    ].join(", ");
    const elements = document.querySelectorAll(query);
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
            selector: generateBestSelector(el)
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