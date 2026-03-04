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

let lastAnalysisData = null;
let chatHistory = [];

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

function switchTab(target) {
    document.getElementById('tabLogs').classList.toggle('active', target === 'logs');
    document.getElementById('tabChat').classList.toggle('active', target === 'chat');
    document.getElementById('viewLogs').classList.toggle('active', target === 'logs');
    document.getElementById('viewChat').classList.toggle('active', target === 'chat');
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
});

function renderMap(map) {
    consoleLog.innerHTML = "";
    searchBar.style.display = 'block';
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
                <button class="btn-run" data-id="${el.aiRef}" title="Ejecutar Clic">▶</button>
            `;
            consoleLog.appendChild(div);
        });
    }

    // Eventos para botones de ejecución
    document.querySelectorAll('.btn-run').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "SIMULATE_CLICK", id });
                e.currentTarget.style.backgroundColor = "#3498db";
                setTimeout(() => e.currentTarget.style.backgroundColor = "#27ae60", 500);
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