// sidepanel.js
const btnAnalizar = document.getElementById('btnAnalizar');
const chkAutoScan = document.getElementById('chkAutoScan');
const btnLimpiar = document.getElementById('btnLimpiar');
const btnConfig = document.getElementById('btnConfig');
const btnExportLogs = document.getElementById('btnExportLogs');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const configPanel = document.getElementById('configPanel');
const consoleLog = document.getElementById('consoleLog');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const searchInput = document.getElementById('searchInput');
const searchBar = document.getElementById('searchBar');
const backendStatus = document.getElementById('backendStatus');

// --- RECORDING / PLAYBACK REFS ---
const btnRecord = document.getElementById('btnRecord');
const recordingBar = document.getElementById('recordingBar');
const recStepCount = document.getElementById('recStepCount');
const journeysList = document.getElementById('journeysList');
const playbackOverlay = document.getElementById('playbackOverlay');
const playbackStepLabel = document.getElementById('playbackStepLabel');
const btnStopPlayback = document.getElementById('btnStopPlayback');

let lastAnalysisData = null;
let chatHistory = [];

// --- RECORDING STATE ---
let isRecording = false;
let recordedSteps = [];
let savedJourneys = [];
let savedTexts = [];
let isPlaying = false;
let stopPlaybackFlag = false;
const PLAYBACK_DELAY_MS = 1000;
let editingTextId = null;
let externalVariables = {};

renderBackendStatus({
    controlConnected: false,
    templateConnected: false,
    isConnecting: true,
    isTemplateConnecting: true
});

chrome.runtime.sendMessage({ action: 'GET_BACKEND_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
        return;
    }
    renderBackendStatus(response);
});

function renderBackendStatus(state) {
    const control = state.controlConnected ? 'principal conectado' : 'principal desconectado';
    const template = state.templateConnected ? 'variables conectadas' : 'variables desconectadas';
    let suffix = '';

    if (!state.controlConnected && state.isConnecting) {
        suffix = ' · reconectando';
    }

    backendStatus.textContent = `Backend: ${control} | ${template}${suffix}`;
}

// --- CONFIGURACIÓN ---
chrome.storage.local.get(['apiKey', 'modelId'], (res) => {
    if (res.apiKey) document.getElementById('apiKey').value = res.apiKey;
    if (res.modelId) document.getElementById('modelId').value = res.modelId;
});

btnSaveConfig.addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value;
    const modelId = document.getElementById('modelId').value;
    chrome.storage.local.set({ apiKey, modelId }, () => {
        configPanel.style.display = 'none';
        alert("Ajustes guardados.");
    });
});

btnConfig.addEventListener('click', () => {
    configPanel.style.display = configPanel.style.display === 'block' ? 'none' : 'block';
});

btnLimpiar.addEventListener('click', () => {
    consoleLog.innerHTML = '<div style="padding:40px; text-align:center; color:#999">Lista vacía.</div>';
    lastAnalysisData = null;
    searchBar.style.display = 'none';
    searchInput.value = '';
});

btnExportLogs.addEventListener('click', async () => {
    const sidepanelLogs = ClusivLogger.getBuffer();

    let backgroundLogs = [];
    try {
        backgroundLogs = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_DEBUG_LOGS' }, (response) => {
                resolve(response?.logs || []);
            });
        });
    } catch (error) {
        console.warn('No se pudieron obtener logs del background:', error);
    }

    const exportData = {
        exported_at: new Date().toISOString(),
        sidepanel_session: ClusivLogger.getSessionId(),
        sidepanel_logs: sidepanelLogs,
        background_logs: backgroundLogs
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `clusiv_debug_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// --- PESTAÑAS ---
document.getElementById('tabLogs').addEventListener('click', () => switchTab('logs'));
document.getElementById('tabChat').addEventListener('click', () => switchTab('chat'));
document.getElementById('tabJourneys').addEventListener('click', () => switchTab('journeys'));
document.getElementById('tabTexts').addEventListener('click', () => switchTab('texts'));

function switchTab(target) {
    document.getElementById('tabLogs').classList.toggle('active', target === 'logs');
    document.getElementById('tabChat').classList.toggle('active', target === 'chat');
    document.getElementById('tabJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('tabTexts').classList.toggle('active', target === 'texts');
    document.getElementById('viewLogs').classList.toggle('active', target === 'logs');
    document.getElementById('viewChat').classList.toggle('active', target === 'chat');
    document.getElementById('viewJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('viewTexts').classList.toggle('active', target === 'texts');
    if (target === 'journeys') renderJourneys();
    if (target === 'texts') renderTexts();
}

// --- ESCANEO Y AUTO-UPDATE ---
btnAnalizar.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "ANALYZE_DOM" });
        if (response?.map) {
            lastAnalysisData = response.map;
            renderMap(response.map);
            addAiMessage("Análisis manual completado. ¿En qué puedo ayudarte?");
        }
    } catch (e) {
        consoleLog.innerHTML = "<div style='color:red; padding:20px'>⚠️ Error: Recarga la página.</div>";
    }
});

chkAutoScan.addEventListener('change', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const action = chkAutoScan.checked ? "START_AUTO_SCAN" : "STOP_AUTO_SCAN";
    chrome.tabs.sendMessage(tab.id, { action });
});

// Escuchar actualizaciones silenciosas del content script
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "AUTO_UPDATE_MAP" && request.map) {
        lastAnalysisData = request.map;
        renderMap(request.map);
    }
    if (request.action === 'BACKEND_STATUS_UPDATED' && request.state) {
        renderBackendStatus(request.state);
    }
    if (request.action === "RECORD_USER_ACTION" && isRecording) {
        const { aiRef, text, selector, locator } = request.data;
        recordedSteps.push({ aiRef, text, selector, locator: locator || null });
        updateRecStepCount();
    }

    // ✅ NUEVO: El content.js detectó un <audio> nuevo en el DOM
    if (request.action === "AUDIO_DETECTED") {
        showAudioBanner(request);
        // También forzar re-render del mapa si ya había datos
        if (lastAnalysisData) {
            refreshMapWithAudio(request);
        }
    }
});

function renderMap(map) {
    consoleLog.innerHTML = "";
    searchBar.style.display = 'block';
    recordingBar.classList.add('active');
    searchInput.value = '';
    for (const [context, elements] of Object.entries(map)) {
        const section = document.createElement('div');
        section.className = 'section-header';
        section.innerText = context;
        consoleLog.appendChild(section);

        elements.forEach(el => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <div class="item-info">
                    <b>${el.text || 'Sin texto'}</b>
                    <span class="selector">${el.tagName}${el.selector}</span>
                </div>
                <button class="btn-run" data-id="${el.aiRef}" data-text="${(el.text || 'Sin texto').replace(/"/g, '&quot;')}" data-selector="${(el.selector || '').replace(/"/g, '&quot;')}" data-locator="${encodeURIComponent(JSON.stringify(el.locator || null))}" title="Ejecutar Clic">▶</button>
            `;
            consoleLog.appendChild(div);
        });
    }

    // Eventos para botones de ejecución
    document.querySelectorAll('.btn-run').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const text = e.currentTarget.getAttribute('data-text');
            const selector = e.currentTarget.getAttribute('data-selector');
            const locatorRaw = e.currentTarget.getAttribute('data-locator');
            let locator = null;
            if (locatorRaw) {
                try {
                    locator = JSON.parse(decodeURIComponent(locatorRaw));
                } catch (err) {
                    locator = null;
                }
            }
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "SIMULATE_CLICK", id, selector, text, locator });
                e.currentTarget.style.backgroundColor = "#3498db";
                setTimeout(() => e.currentTarget.style.backgroundColor = "#27ae60", 500);

                // --- RECORDING: capturar paso ---
                if (isRecording) {
                    recordedSteps.push({ aiRef: id, text, selector, locator });
                    updateRecStepCount();
                }
            }
        });
    });
}

// --- CHAT ---
async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    chatInput.value = "";

    const loadingId = addAiMessage("⏳ Procesando...");
    const aiResponse = await callOpenRouter(text);

    const msgDiv = document.getElementById(loadingId);
    if (msgDiv) msgDiv.innerText = aiResponse;

    chatHistory.push({ role: "user", content: text }, { role: "assistant", content: aiResponse });
}

async function callOpenRouter(userText) {
    const storage = await chrome.storage.local.get(['apiKey', 'modelId']);
    if (!storage.apiKey) return "❌ Configura la API Key.";

    const contextStr = JSON.stringify(lastAnalysisData || {}).slice(0, 4000);
    const messages = [
        { role: "system", content: `Eres un experto QA. Contexto DOM actual: ${contextStr}` },
        ...chatHistory.slice(-4),
        { role: "user", content: userText }
    ];

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${storage.apiKey}`,
                "X-Title": "Web Analyst Pro"
            },
            body: JSON.stringify({ model: storage.modelId || "google/gemini-2.0-flash-001", messages })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Error en respuesta.";
    } catch {
        return "❌ Error de conexión.";
    }
}

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addAiMessage(text) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = id;
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

btnSend.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });

// --- BÚSQUEDA ---
searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    const items = consoleLog.querySelectorAll('.item');
    const sections = consoleLog.querySelectorAll('.section-header');

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? '' : 'none';
    });

    // Hide section headers that have no visible items
    sections.forEach(section => {
        let next = section.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('section-header')) {
            if (next.classList.contains('item') && next.style.display !== 'none') {
                hasVisible = true;
                break;
            }
            next = next.nextElementSibling;
        }
        section.style.display = hasVisible ? '' : 'none';
    });
});

// --- RECORDING CONTROLS ---
function updateRecStepCount() {
    recStepCount.textContent = `${recordedSteps.length} paso${recordedSteps.length !== 1 ? 's' : ''}`;
    recStepCount.classList.toggle('has-steps', recordedSteps.length > 0);
}

function showTextPicker() {
    const panel = document.getElementById('textPickerPanel');
    const list = document.getElementById('textPickerList');
    list.innerHTML = '';

    if (savedTexts.length === 0) {
        list.innerHTML = '<div class="text-picker-empty">No hay textos guardados.<br>Ve a la pestaña Textos para crear uno.</div>';
    } else {
        savedTexts.forEach((txt) => {
            const item = document.createElement('div');
            const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 50);
            item.className = 'text-picker-item';
            item.innerHTML = `<b>${txt.name}</b><span>${preview}${txt.content.length > 50 ? '...' : ''}</span>`;
            item.addEventListener('click', () => {
                recordedSteps.push({
                    stepType: 'paste_text',
                    textId: txt.id,
                    textName: txt.name
                });
                updateRecStepCount();
                panel.style.display = 'none';
            });
            list.appendChild(item);
        });
    }

    panel.style.display = 'flex';
}

async function startRecording() {
    isRecording = true;
    recordedSteps = [];
    updateRecStepCount();
    btnRecord.textContent = '⏹ Detener';
    btnRecord.classList.add('recording');
    recordingBar.classList.add('is-recording');
    document.getElementById('btnAddTextStep').classList.add('visible');
    document.getElementById('btnAddKeyStep').classList.add('visible');
    document.getElementById('btnAddWaitStep').classList.add('visible');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "START_RECORDING" }).catch(() => { });
    }
}

async function stopRecording() {
    isRecording = false;
    btnRecord.textContent = '⏺ Grabar';
    btnRecord.classList.remove('recording');
    recordingBar.classList.remove('is-recording');
    document.getElementById('btnAddTextStep').classList.remove('visible');
    document.getElementById('btnAddKeyStep').classList.remove('visible');
    document.getElementById('btnAddWaitStep').classList.remove('visible');
    document.getElementById('textPickerPanel').style.display = 'none';
    document.getElementById('keyPickerPanel').style.display = 'none';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "STOP_RECORDING" }).catch(() => { });
    }

    if (recordedSteps.length === 0) {
        alert('No se grabaron pasos.');
        return;
    }

    const name = prompt(`Guardar secuencia (${recordedSteps.length} pasos).\nIngresa un nombre:`);
    if (!name || !name.trim()) {
        alert('Grabación descartada.');
        recordedSteps = [];
        updateRecStepCount();
        return;
    }

    const journey = {
        id: 'j-' + Date.now(),
        name: name.trim(),
        steps: [...recordedSteps],
        createdAt: new Date().toLocaleString()
    };
    savedJourneys.push(journey);
    saveJourneys();
    recordedSteps = [];
    updateRecStepCount();
    alert(`✅ Secuencia "${journey.name}" guardada con ${journey.steps.length} pasos.`);
}

btnRecord.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

document.getElementById('btnAddTextStep').addEventListener('click', () => {
    if (!isRecording) {
        return;
    }

    showTextPicker();
});

document.getElementById('btnCloseTextPicker').addEventListener('click', () => {
    document.getElementById('textPickerPanel').style.display = 'none';
});

// --- KEY PICKER ---
const KEY_GROUPS = [
    {
        label: 'Más usadas',
        keys: [
            { label: 'Enter', key: 'Enter', code: 'Enter', keyCode: 13 },
            { label: 'Tab', key: 'Tab', code: 'Tab', keyCode: 9 },
            { label: 'Esc', key: 'Escape', code: 'Escape', keyCode: 27 },
            { label: 'Espacio', key: ' ', code: 'Space', keyCode: 32 },
            { label: '⌫ Backspace', key: 'Backspace', code: 'Backspace', keyCode: 8 },
            { label: 'Delete', key: 'Delete', code: 'Delete', keyCode: 46 },
        ]
    },
    {
        label: 'Navegación',
        keys: [
            { label: '↑', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            { label: '↓', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            { label: '←', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            { label: '→', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            { label: 'Home', key: 'Home', code: 'Home', keyCode: 36 },
            { label: 'End', key: 'End', code: 'End', keyCode: 35 },
            { label: 'PgUp', key: 'PageUp', code: 'PageUp', keyCode: 33 },
            { label: 'PgDn', key: 'PageDown', code: 'PageDown', keyCode: 34 },
        ]
    },
    {
        label: 'Modificadores',
        keys: [
            { label: 'Ctrl+A', key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true },
            { label: 'Ctrl+C', key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true },
            { label: 'Ctrl+V', key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true },
            { label: 'Ctrl+Z', key: 'z', code: 'KeyZ', keyCode: 90, ctrlKey: true },
            { label: 'Ctrl+Enter', key: 'Enter', code: 'Enter', keyCode: 13, ctrlKey: true },
            { label: 'Shift+Enter', key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true },
            { label: 'Shift+Tab', key: 'Tab', code: 'Tab', keyCode: 9, shiftKey: true },
        ]
    },
    {
        label: 'Función',
        keys: [
            { label: 'F1', key: 'F1', code: 'F1', keyCode: 112 },
            { label: 'F2', key: 'F2', code: 'F2', keyCode: 113 },
            { label: 'F5', key: 'F5', code: 'F5', keyCode: 116 },
            { label: 'F12', key: 'F12', code: 'F12', keyCode: 123 },
        ]
    }
];

function showKeyPicker() {
    const panel = document.getElementById('keyPickerPanel');
    const list = document.getElementById('keyPickerList');
    list.innerHTML = '';
    document.getElementById('textPickerPanel').style.display = 'none';

    KEY_GROUPS.forEach(group => {
        const label = document.createElement('div');
        label.className = 'key-group-label';
        label.textContent = group.label;
        list.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'key-grid';

        group.keys.forEach(keyDef => {
            const chip = document.createElement('button');
            chip.className = 'key-chip';
            chip.textContent = keyDef.label;
            chip.title = keyDef.key;
            chip.addEventListener('click', () => {
                recordedSteps.push({
                    stepType: 'key_press',
                    key: keyDef.key,
                    code: keyDef.code,
                    keyCode: keyDef.keyCode,
                    ctrlKey: keyDef.ctrlKey || false,
                    shiftKey: keyDef.shiftKey || false,
                    altKey: keyDef.altKey || false,
                    label: keyDef.label
                });
                updateRecStepCount();
                panel.style.display = 'none';
            });
            grid.appendChild(chip);
        });

        list.appendChild(grid);
    });

    panel.style.display = 'flex';
}

document.getElementById('btnAddKeyStep').addEventListener('click', () => {
    if (!isRecording) return;
    showKeyPicker();
});

document.getElementById('btnCloseKeyPicker').addEventListener('click', () => {
    document.getElementById('keyPickerPanel').style.display = 'none';
});

// --- WAIT STEP ---
document.getElementById('btnAddWaitStep').addEventListener('click', () => {
    if (!isRecording) return;
    const secondsStr = prompt('¿Cuántos segundos deseas esperar?', '5');
    if (!secondsStr) return;

    const seconds = parseFloat(secondsStr);
    if (isNaN(seconds) || seconds <= 0) {
        alert('Por favor ingresa un número válido mayor a 0.');
        return;
    }

    recordedSteps.push({
        stepType: 'wait',
        durationMs: seconds * 1000,
        label: `Esperar ${seconds} segundos`
    });
    updateRecStepCount();
});

// --- JOURNEY PERSISTENCE ---
function loadJourneys() {
    chrome.storage.local.get(['savedJourneys'], (res) => {
        savedJourneys = res.savedJourneys || [];
    });
}

function saveJourneys() {
    chrome.storage.local.set({ savedJourneys }, () => {
        sendJourneysToPython();
    });
}

loadJourneys();

function loadTexts() {
    chrome.storage.local.get(['savedTexts'], (res) => {
        savedTexts = res.savedTexts || [];
    });
}

function saveTexts() {
    chrome.storage.local.set({ savedTexts });
}

loadTexts();

function loadExternalVariables() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['externalVariables'], (res) => {
            externalVariables = res.externalVariables || {};
            resolve(externalVariables);
        });
    });
}

function resolveTemplateVariables(content) {
    return ClusivJourneyRuntime.resolveTemplateVariables(content, externalVariables).content;
}

loadExternalVariables();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.externalVariables) {
        return;
    }

    externalVariables = changes.externalVariables.newValue || {};
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'EXTERNAL_VARIABLES_UPDATED') {
        externalVariables = request.variables || {};
    }
});

document.getElementById('btnNewText').addEventListener('click', () => {
    editingTextId = null;
    document.getElementById('textNameInput').value = '';
    document.getElementById('textContentInput').value = '';
    document.getElementById('textEditorPanel').style.display = 'flex';
    document.getElementById('textNameInput').focus();
});

document.getElementById('btnCancelText').addEventListener('click', () => {
    document.getElementById('textEditorPanel').style.display = 'none';
    editingTextId = null;
});

document.getElementById('btnSaveText').addEventListener('click', () => {
    const name = document.getElementById('textNameInput').value.trim();
    const content = document.getElementById('textContentInput').value;

    if (!name) {
        alert('El texto necesita un nombre.');
        return;
    }

    if (!content.trim()) {
        alert('El contenido no puede estar vacio.');
        return;
    }

    if (editingTextId) {
        const index = savedTexts.findIndex((txt) => txt.id === editingTextId);
        if (index !== -1) {
            savedTexts[index].name = name;
            savedTexts[index].content = content;
        }
    } else {
        savedTexts.push({
            id: 'txt-' + Date.now(),
            name,
            content
        });
    }

    saveTexts();
    renderTexts();
});

function renderTexts() {
    const textsList = document.getElementById('textsList');
    const editorPanel = document.getElementById('textEditorPanel');
    textsList.innerHTML = '';
    editorPanel.style.display = 'none';
    editingTextId = null;
    document.getElementById('textNameInput').value = '';
    document.getElementById('textContentInput').value = '';

    if (savedTexts.length === 0) {
        textsList.innerHTML = '<div class="journey-empty">No hay textos guardados.</div>';
        return;
    }

    savedTexts.forEach((txt) => {
        const div = document.createElement('div');
        const preview = txt.content.replace(/\s+/g, ' ').trim().slice(0, 60);
        div.className = 'text-item';
        div.innerHTML = `
            <div class="text-item-info">
                <b>${txt.name}</b>
                <span>${preview}${txt.content.length > 60 ? '...' : ''}</span>
            </div>
            <div class="text-item-actions">
                <button class="btn-edit-text" data-id="${txt.id}" title="Editar">✏</button>
                <button class="btn-delete-text" data-id="${txt.id}" title="Eliminar">🗑</button>
            </div>
        `;
        textsList.appendChild(div);
    });

    textsList.querySelectorAll('.btn-edit-text').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const textRecord = savedTexts.find((txt) => txt.id === id);
            if (!textRecord) {
                return;
            }

            editingTextId = id;
            document.getElementById('textNameInput').value = textRecord.name;
            document.getElementById('textContentInput').value = textRecord.content;
            document.getElementById('textEditorPanel').style.display = 'flex';
        });
    });

    textsList.querySelectorAll('.btn-delete-text').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const textRecord = savedTexts.find((txt) => txt.id === id);
            if (!textRecord) {
                return;
            }

            if (confirm(`¿Eliminar el texto "${textRecord.name}"?`)) {
                savedTexts = savedTexts.filter((txt) => txt.id !== id);
                saveTexts();
                renderTexts();
            }
        });
    });
}

// --- RENDER JOURNEYS LIST ---
function renderJourneys() {
    journeysList.innerHTML = '';
    if (savedJourneys.length === 0) {
        journeysList.innerHTML = '<div class="journey-empty">No hay secuencias guardadas.</div>';
        return;
    }
    savedJourneys.forEach((journey, index) => {
        const wrapper = document.createElement('div');

        // --- Journey Header ---
        const header = document.createElement('div');
        header.className = 'journey-item';
        header.innerHTML = `
            <button class="btn-toggle-steps" title="Ver pasos">▶</button>
            <div class="journey-info">
                <b>${journey.name}</b>
                <span>${journey.steps.length} pasos · ${journey.createdAt}</span>
            </div>
            <div class="journey-actions">
                <button class="btn-edit-journey" data-index="${index}" title="Editar titulo">✏</button>
                <button class="btn-play-journey" data-index="${index}" title="Reproducir">▶</button>
                <button class="btn-export-journey" data-index="${index}" title="Exportar JSON">⬇</button>
                <button class="btn-delete-journey" data-index="${index}" title="Eliminar">🗑</button>
            </div>
        `;

        // --- Steps List (Hidden) ---
        const stepsContainer = document.createElement('div');
        stepsContainer.className = 'steps-container';

        if (journey.steps && journey.steps.length > 0) {
            journey.steps.forEach((step, stepIdx) => {
                const stepDiv = document.createElement('div');

                if (step.stepType === 'paste_text') {
                    stepDiv.className = 'step-item step-type-paste';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-paste-badge">TEXTO</span>
                        <span class="step-desc" title="${step.textName || 'Texto guardado'}">${step.textName || 'Texto guardado'}</span>
                    `;
                } else if (step.stepType === 'key_press') {
                    stepDiv.className = 'step-item step-type-key';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-key-badge">TECLA</span>
                        <span class="step-key-label">${step.label || step.key}</span>
                    `;
                } else if (step.stepType === 'wait') {
                    stepDiv.className = 'step-item step-type-wait';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-wait-badge">ESPERA</span>
                        <span class="step-desc">${step.label}</span>
                    `;
                } else {
                    const selectorDisplay = step.selector ? (step.selector.length > 30 ? '...' + step.selector.slice(-30) : step.selector) : '';
                    stepDiv.className = 'step-item';
                    stepDiv.innerHTML = `
                        <span class="step-index">#${stepIdx + 1}</span>
                        <span class="step-desc" title="${step.text || step.selector}">${step.text || 'Acción sin nombre'}</span>
                        <span class="step-selector" title="${step.selector || ''}">${selectorDisplay}</span>
                    `;
                }

                stepsContainer.appendChild(stepDiv);
            });
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'step-item';
            emptyDiv.innerHTML = '<span style="color:#999; font-style:italic;">No hay pasos grabados</span>';
            stepsContainer.appendChild(emptyDiv);
        }

        // --- Toggle Logic ---
        const toggleBtn = header.querySelector('.btn-toggle-steps');
        toggleBtn.addEventListener('click', () => {
            const isHidden = getComputedStyle(stepsContainer).display === 'none';
            stepsContainer.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? '▼' : '▶';
        });

        wrapper.appendChild(header);
        wrapper.appendChild(stepsContainer);
        journeysList.appendChild(wrapper);
    });

    journeysList.querySelectorAll('.btn-edit-journey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            renameJourney(idx);
        });
    });

    // Play buttons
    journeysList.querySelectorAll('.btn-play-journey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent toggling if clicked inside
            const idx = parseInt(btn.getAttribute('data-index'));
            playJourney(savedJourneys[idx]);
        });
    });

    // Export buttons
    journeysList.querySelectorAll('.btn-export-journey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'));
            exportJourneyAsFile(savedJourneys[idx]);
        });
    });

    // Delete buttons
    journeysList.querySelectorAll('.btn-delete-journey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-index'));
            const name = savedJourneys[idx].name;
            if (confirm(`¿Eliminar la secuencia "${name}"?`)) {
                savedJourneys.splice(idx, 1);
                saveJourneys();
                renderJourneys();
            }
        });
    });
}

function renameJourney(index) {
    const journey = savedJourneys[index];
    if (!journey) {
        return;
    }

    const nextName = prompt('Editar titulo del journey:', journey.name);
    if (nextName === null) {
        return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
        alert('El titulo no puede estar vacio.');
        return;
    }

    if (trimmedName === journey.name) {
        return;
    }

    journey.name = trimmedName;
    saveJourneys();
    renderJourneys();
}

// --- PLAYBACK ---
async function playJourney(journey) {
    if (isPlaying) {
        alert('Ya se está reproduciendo una secuencia.');
        return;
    }
    isPlaying = true;
    stopPlaybackFlag = false;
    playbackOverlay.classList.add('active');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        playbackOverlay.classList.remove('active');
        isPlaying = false;
        return;
    }

    await loadExternalVariables();

    const plan = ClusivJourneyRuntime.buildJourneyExecutionPlan({
        journey,
        savedTexts,
        externalVariables
    });

    if (plan.hasBlockingIssues) {
        playbackStepLabel.textContent = `⚠️ ${ClusivJourneyRuntime.summarizeBlockingIssues(plan.issues)}`;
        playbackOverlay.classList.remove('active');
        isPlaying = false;
        return;
    }

    const executionResult = await ClusivJourneyRuntime.executeJourneyPlan({
        plan,
        sendToTab: (payload) => chrome.tabs.sendMessage(tab.id, payload),
        shouldStop: () => stopPlaybackFlag,
        betweenStepDelayMs: PLAYBACK_DELAY_MS,
        finalTextDelayMs: PLAYBACK_DELAY_MS,
        onStepStart: (step, stepIndex, totalSteps) => {
            playbackStepLabel.textContent = `Paso ${stepIndex + 1}/${totalSteps}: ${ClusivJourneyRuntime.getStepDisplayLabel(step)}`;
        }
    });

    if (executionResult.status === 'error') {
        playbackStepLabel.textContent = `⚠️ ${executionResult.message}`;
    } else if (executionResult.status === 'stopped') {
        playbackStepLabel.textContent = '⏹ Reproducción detenida';
    }

    playbackOverlay.classList.remove('active');
    isPlaying = false;
}

btnStopPlayback.addEventListener('click', () => {
    stopPlaybackFlag = true;
});

// ============================================================
// NUEVAS FUNCIONES — agregar al final de sidepanel.js
// ============================================================

/**
 * Muestra un banner flotante cuando se detecta audio nuevo.
 * Permite reproducir, pausar y descargar sin salir del panel.
 */
function showAudioBanner(audioInfo) {
    // Remover banner anterior si existe
    const old = document.getElementById('audioBanner');
    if (old) old.remove();

    const banner = document.createElement('div');
    banner.id = 'audioBanner';
    banner.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0;
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border-top: 2px solid #7c3aed;
        padding: 10px 12px;
        z-index: 9999;
        font-size: 11px;
        color: #f0f0f5;
        box-shadow: 0 -4px 20px rgba(124,58,237,0.3);
    `;

    const srcLabel = audioInfo.isBase64 ? 'base64/WAV'
        : audioInfo.isBlob ? 'blob audio'
            : (audioInfo.src || 'audio');

    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:18px;">🎵</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#c4b5fd;">Audio detectado</div>
                <div style="color:#a0a0b0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${srcLabel}
                    ${audioInfo.duration ? ` · ${Math.round(audioInfo.duration)}s` : ''}
                </div>
            </div>
            <button id="audioBannerPlay"   style="${bannerBtnStyle('#10b981')}">▶ Play</button>
            <button id="audioBannerPause"  style="${bannerBtnStyle('#f59e0b')}">⏸ Pause</button>
            <button id="audioBannerDl"     style="${bannerBtnStyle('#3b82f6')}">⬇ Descargar</button>
            <button id="audioBannerClose"  style="${bannerBtnStyle('#6b7280')}">✕</button>
        </div>
    `;

    document.body.appendChild(banner);

    // Eventos del banner
    document.getElementById('audioBannerPlay').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, {
            action: "CONTROL_AUDIO",
            command: "play",
            aiRef: audioInfo.aiRef
        });
    });

    document.getElementById('audioBannerPause').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, {
            action: "CONTROL_AUDIO",
            command: "pause",
            aiRef: audioInfo.aiRef
        });
    });

    document.getElementById('audioBannerDl').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, {
            action: "DOWNLOAD_AUDIO",
            aiRef: audioInfo.aiRef,
            filename: `audio_${Date.now()}.wav`
        });
    });

    document.getElementById('audioBannerClose').addEventListener('click', () => {
        banner.remove();
    });
}

function bannerBtnStyle(color) {
    return `
        background:${color}; border:none; border-radius:6px;
        color:white; padding:5px 10px; cursor:pointer;
        font-size:11px; font-weight:700; white-space:nowrap;
    `;
}

/**
 * Agrega el audio detectado al mapa DOM ya renderizado,
 * sin necesidad de hacer un re-scan completo.
 */
function refreshMapWithAudio(audioInfo) {
    // Buscar si ya existe la sección de media
    let mediaSection = Array.from(consoleLog.querySelectorAll('.section-header'))
        .find(h => h.innerText.includes('Reproductor'));

    if (!mediaSection) {
        mediaSection = document.createElement('div');
        mediaSection.className = 'section-header';
        mediaSection.innerText = '🎵 Reproductor de Media';
        consoleLog.insertBefore(mediaSection, consoleLog.firstChild);
    }

    // Evitar duplicados por aiRef
    const existingItem = consoleLog.querySelector(`[data-audio-ref="${audioInfo.aiRef}"]`);
    if (existingItem) return;

    const srcLabel = audioInfo.isBase64 ? '[base64 · WAV]'
        : audioInfo.isBlob ? '[blob audio]'
            : (audioInfo.src || '').slice(0, 50);

    const div = document.createElement('div');
    div.className = 'item';
    div.setAttribute('data-audio-ref', audioInfo.aiRef);
    div.style.background = 'rgba(124,58,237,0.08)';
    div.style.borderLeft = '3px solid #7c3aed';
    div.innerHTML = `
        <div class="item-info">
            <b>🎵 audio · ${srcLabel}</b>
            <span class="selector">audio[data-ai-ref="${audioInfo.aiRef}"]</span>
        </div>
        <div style="display:flex; gap:4px;">
            <button class="btn-audio-play btn-run" 
                    style="background:#10b981; width:auto; padding:0 8px; border-radius:4px;"
                    data-ai-ref="${audioInfo.aiRef}" title="Play">▶</button>
            <button class="btn-audio-dl btn-run"
                    style="background:#3b82f6; width:auto; padding:0 8px; border-radius:4px;"
                    data-ai-ref="${audioInfo.aiRef}" title="Descargar">⬇</button>
        </div>
    `;

    // Insertar justo después de la sección header de media
    mediaSection.insertAdjacentElement('afterend', div);

    // Eventos de los botones inline
    div.querySelector('.btn-audio-play').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, {
            action: "CONTROL_AUDIO", command: "play", aiRef: audioInfo.aiRef
        });
    });

    div.querySelector('.btn-audio-dl').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, {
            action: "DOWNLOAD_AUDIO",
            aiRef: audioInfo.aiRef,
            filename: `audio_${Date.now()}.wav`
        });
    });
}

// ==========================================
// --- EXPORTACIÓN DE JOURNEYS ---
// ==========================================

/**
 * Convierte un locator del formato interno de la extensión
 * al formato de 6 estrategias para exportación.
 * @param {object|null} locator - El locator guardado en el journey step
 * @param {string} selector - El selector CSS del step
 * @param {string} text - El texto visible del step
 * @param {string} aiRef - El data-ai-ref del step
 * @returns {object} Locators en formato exportable
 */
function buildExportLocators(locator, selector, text, aiRef) {
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

/**
 * Determina si un step es de tipo paste_text.
 * @param {object} step - El step del journey
 * @returns {boolean}
 */
function stepIsPasteText(step) {
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

/**
 * Construye el payload JSON completo para exportar un journey.
 * @param {object} journey - El journey tal como está en savedJourneys
 * @param {object} tabContext - { url, origin, page_title } de la pestaña activa
 * @returns {object} Objeto listo para JSON.stringify
 */
function buildExportPayload(journey, tabContext) {
    const now = new Date().toISOString();

    let createdAtIso = journey.createdAt;
    try {
        const parsed = new Date(journey.createdAt);
        if (!Number.isNaN(parsed.getTime())) {
            createdAtIso = parsed.toISOString();
        }
    } catch (e) {
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
            const textRecord = savedTexts.find((txt) => txt.id === step.textId);
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

/**
 * Obtiene el contexto de la pestaña activa desde el background
 * y exporta el journey como archivo .json descargable.
 * @param {object} journey - El journey a exportar
 */
async function exportJourneyAsFile(journey) {
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
    } catch (e) {
        console.warn('No se pudo obtener contexto de pestaña:', e);
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