import { collectDeepInteractiveElements } from './queries.js';
import { buildStableLocator, generateBestSelector } from './selectors.js';
import { isVisibleElement } from './visibility.js';

export function identifyContext(el) {
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

export function getSemanticMap() {
    const elements = collectDeepInteractiveElements();
    const groupedData = {};

    elements.forEach((el) => {
        if (!isVisibleElement(el)) {
            return;
        }

        let refId = el.dataset.aiRef;
        if (!refId) {
            refId = `ai-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
            el.dataset.aiRef = refId;
        }

        const context = identifyContext(el);
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

        if (!groupedData[context]) {
            groupedData[context] = [];
        }
        groupedData[context].push(elementData);
    });

    return groupedData;
}