// sidepanel.js
const btnAnalizar = document.getElementById('btnAnalizar');
const chkAutoScan = document.getElementById('chkAutoScan');
const btnLimpiar = document.getElementById('btnLimpiar');
const btnConfig = document.getElementById('btnConfig');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const configPanel = document.getElementById('configPanel');
const consoleLog = document.getElementById('consoleLog');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const searchInput = document.getElementById('searchInput');
const searchBar = document.getElementById('searchBar');

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
let isPlaying = false;
let stopPlaybackFlag = false;
const PLAYBACK_DELAY_MS = 1000;

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

// --- PESTAÑAS ---
document.getElementById('tabLogs').addEventListener('click', () => switchTab('logs'));
document.getElementById('tabChat').addEventListener('click', () => switchTab('chat'));
document.getElementById('tabJourneys').addEventListener('click', () => switchTab('journeys'));

function switchTab(target) {
    document.getElementById('tabLogs').classList.toggle('active', target === 'logs');
    document.getElementById('tabChat').classList.toggle('active', target === 'chat');
    document.getElementById('tabJourneys').classList.toggle('active', target === 'journeys');
    document.getElementById('viewLogs').classList.toggle('active', target === 'logs');
    document.getElementById('viewChat').classList.toggle('active', target === 'chat');
    document.getElementById('viewJourneys').classList.toggle('active', target === 'journeys');
    if (target === 'journeys') renderJourneys();
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

async function startRecording() {
    isRecording = true;
    recordedSteps = [];
    updateRecStepCount();
    btnRecord.textContent = '⏹ Detener';
    btnRecord.classList.add('recording');
    recordingBar.classList.add('is-recording');

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

// --- JOURNEY PERSISTENCE ---
function loadJourneys() {
    chrome.storage.local.get(['savedJourneys'], (res) => {
        savedJourneys = res.savedJourneys || [];
    });
}

function saveJourneys() {
    chrome.storage.local.set({ savedJourneys });
}

loadJourneys();

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
                stepDiv.className = 'step-item';

                // Truncate selector for display
                const selectorDisplay = step.selector ? (step.selector.length > 30 ? '...' + step.selector.slice(-30) : step.selector) : '';

                stepDiv.innerHTML = `
                    <span class="step-index">#${stepIdx + 1}</span>
                    <span class="step-desc" title="${step.text || step.selector}">${step.text || 'Acción sin nombre'}</span>
                    <span class="step-selector" title="${step.selector || ''}">${selectorDisplay}</span>
                `;
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

    for (let i = 0; i < journey.steps.length; i++) {
        if (stopPlaybackFlag) break;

        const step = journey.steps[i];
        playbackStepLabel.textContent = `Paso ${i + 1}/${journey.steps.length}: ${step.text}`;

        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "SIMULATE_CLICK",
                id: step.aiRef,
                selector: step.selector,
                text: step.text,
                locator: step.locator || null
            });
        } catch (e) {
            playbackStepLabel.textContent = `⚠️ Error en paso ${i + 1}: elemento no encontrado`;
        }

        if (i < journey.steps.length - 1 && !stopPlaybackFlag) {
            await new Promise(resolve => setTimeout(resolve, PLAYBACK_DELAY_MS));
        }
    }

    playbackOverlay.classList.remove('active');
    isPlaying = false;
    if (!stopPlaybackFlag) {
        alert(`✅ Secuencia "${journey.name}" completada.`);
    }
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
        const isPaste = stepIsPasteText(step);
        const locators = buildExportLocators(
            step.locator || null,
            step.selector || '',
            step.text || '',
            step.aiRef || ''
        );

        return {
            index: index + 1,
            action: isPaste ? 'paste_text' : 'click',
            description: step.text || `Paso ${index + 1}`,
            text_to_paste: isPaste ? (step.textToPaste || step.text_to_paste || null) : null,
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
