import { refs } from './dom-refs.js';
import * as state from './state.js';
import { addAiMessage } from './chat.js';
import { updateRecStepCount } from './recording/controls.js';

export function clearMap() {
    refs.consoleLog.innerHTML = '<div style="padding:40px; text-align:center; color:#999">Lista vacía.</div>';
    state.setLastAnalysisData(null);
    refs.searchBar.style.display = 'none';
    refs.searchInput.value = '';
}

export function renderMap(map) {
    refs.consoleLog.innerHTML = '';
    refs.searchBar.style.display = 'block';
    refs.recordingBar.classList.add('active');
    refs.searchInput.value = '';

    for (const [context, elements] of Object.entries(map)) {
        const section = document.createElement('div');
        section.className = 'section-header';
        section.innerText = context;
        refs.consoleLog.appendChild(section);

        elements.forEach((el) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <div class="item-info">
                    <b>${el.text || 'Sin texto'}</b>
                    <span class="selector">${el.tagName}${el.selector}</span>
                </div>
                <button class="btn-run" data-id="${el.aiRef}" data-text="${(el.text || 'Sin texto').replace(/"/g, '&quot;')}" data-selector="${(el.selector || '').replace(/"/g, '&quot;')}" data-locator="${encodeURIComponent(JSON.stringify(el.locator || null))}" title="Ejecutar Clic">▶</button>
            `;
            refs.consoleLog.appendChild(div);
        });
    }

    document.querySelectorAll('.btn-run').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            const id = event.currentTarget.getAttribute('data-id');
            const text = event.currentTarget.getAttribute('data-text');
            const selector = event.currentTarget.getAttribute('data-selector');
            const locatorRaw = event.currentTarget.getAttribute('data-locator');
            let locator = null;

            if (locatorRaw) {
                try {
                    locator = JSON.parse(decodeURIComponent(locatorRaw));
                } catch {
                    locator = null;
                }
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: 'SIMULATE_CLICK', id, selector, text, locator });
                event.currentTarget.style.backgroundColor = '#3498db';
                setTimeout(() => {
                    event.currentTarget.style.backgroundColor = '#27ae60';
                }, 500);

                if (state.isRecording) {
                    state.addRecordedStep({ aiRef: id, text, selector, locator });
                    updateRecStepCount();
                }
            }
        });
    });
}

export function applyAutoUpdateMap(map) {
    state.setLastAnalysisData(map);
    renderMap(map);
}

export function initScan() {
    refs.btnAnalizar.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'ANALYZE_DOM' });
            if (response?.map) {
                state.setLastAnalysisData(response.map);
                renderMap(response.map);
                addAiMessage('Análisis manual completado. ¿En qué puedo ayudarte?');
            }
        } catch {
            refs.consoleLog.innerHTML = "<div style='color:red; padding:20px'>⚠️ Error: Recarga la página.</div>";
        }
    });

    refs.chkAutoScan.addEventListener('change', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            return;
        }

        const action = refs.chkAutoScan.checked ? 'START_AUTO_SCAN' : 'STOP_AUTO_SCAN';
        chrome.tabs.sendMessage(tab.id, { action });
    });

    refs.btnLimpiar.addEventListener('click', clearMap);
}