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
        const { aiRef, text, selector } = request.data;
        recordedSteps.push({ aiRef, text, selector });
        updateRecStepCount();
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
                <button class="btn-run" data-id="${el.aiRef}" data-text="${(el.text || 'Sin texto').replace(/"/g, '&quot;')}" data-selector="${(el.selector || '').replace(/"/g, '&quot;')}" title="Ejecutar Clic">▶</button>
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
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "SIMULATE_CLICK", id });
                e.currentTarget.style.backgroundColor = "#3498db";
                setTimeout(() => e.currentTarget.style.backgroundColor = "#27ae60", 500);

                // --- RECORDING: capturar paso ---
                if (isRecording) {
                    recordedSteps.push({ aiRef: id, text, selector });
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
        chrome.tabs.sendMessage(tab.id, { action: "START_RECORDING" }).catch(() => {});
    }
}

async function stopRecording() {
    isRecording = false;
    btnRecord.textContent = '⏺ Grabar';
    btnRecord.classList.remove('recording');
    recordingBar.classList.remove('is-recording');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "STOP_RECORDING" }).catch(() => {});
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
                text: step.text 
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