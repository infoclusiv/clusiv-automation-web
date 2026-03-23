// Configuración para abrir el panel lateral al hacer clic en el icono 
chrome.sidePanel 
  .setPanelBehavior({ openPanelOnActionClick: true }) 
  .catch((error) => console.error(error)); 

importScripts('journey_runtime.js');

// ========================================== 
// --- CLIENTE WEBSOCKET (CONEXIÓN A PYTHON) --- 
// ========================================== 
let ws = null; 
let isConnecting = false; 
let templateWs = null;
let isTemplateConnecting = false;
let externalVariablesCache = {};
const CHATGPT_TAB_PATTERNS = ['https://chatgpt.com/*', 'https://chat.openai.com/*'];
const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const backendConnectionState = {
    controlConnected: false,
    templateConnected: false,
    controlReadyState: WebSocket.CLOSED,
    templateReadyState: WebSocket.CLOSED
};
let preferredChatGptTabId = null;
const WS_URL = 'ws://localhost:8765'; 
const TEMPLATE_WS_URL = 'ws://localhost:8766';

chrome.storage.local.get(['externalVariables'], (res) => {
    externalVariablesCache = res.externalVariables || {};
});

function notifyExternalVariablesUpdated() {
    chrome.runtime.sendMessage({
        action: 'EXTERNAL_VARIABLES_UPDATED',
        variables: externalVariablesCache
    }).catch(() => {
    });
}

function notifyBackendStatusUpdated() {
    chrome.runtime.sendMessage({
        action: 'BACKEND_STATUS_UPDATED',
        state: getBackendStatus()
    }).catch(() => {
    });
}

function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

function getBackendStatus() {
    return {
        ...backendConnectionState,
        isConnecting,
        isTemplateConnecting
    };
}

function updateBackendConnectionState(partialState) {
    Object.assign(backendConnectionState, partialState);
    notifyBackendStatusUpdated();
}

function sendControlMessage(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }

    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch (error) {
        console.error('No se pudo enviar mensaje al backend.', { payload, error });
        return false;
    }
}

function sendTemplateSyncAck(updatedAt, variableNames = []) {
    if (!updatedAt || !templateWs || templateWs.readyState !== WebSocket.OPEN) {
        return;
    }

    templateWs.send(JSON.stringify({
        action: 'TEMPLATE_VARIABLES_SYNCED',
        updatedAt,
        variableNames
    }));
}

function persistExternalVariables(incomingVariables, metadata = null, updatedAt = null) {
    if (!incomingVariables || typeof incomingVariables !== 'object') {
        return;
    }

    externalVariablesCache = {
        ...externalVariablesCache,
        ...incomingVariables
    };

    chrome.storage.local.set({
        externalVariables: externalVariablesCache,
        externalVariablesMetadata: metadata || null,
        externalVariablesUpdatedAt: updatedAt || null
    }, () => {
        notifyExternalVariablesUpdated();
        sendTemplateSyncAck(updatedAt, Object.keys(incomingVariables));
    });
}

async function getExecutionPreparation(journeyId, options = {}) {
    const storageState = await storageGet(['savedJourneys', 'savedTexts', 'externalVariables']);
    const journeys = storageState.savedJourneys || [];
    const savedTexts = storageState.savedTexts || [];
    const variables = {
        ...storageState.externalVariables,
        ...externalVariablesCache,
        ...(options.externalVariables || {})
    };
    const journey = journeys.find((candidate) => candidate.id === journeyId) || null;

    if (!journey) {
        return {
            ok: false,
            error: `Journey ID '${journeyId}' no encontrado en la extensión.`,
            issues: [
                {
                    severity: 'error',
                    code: 'journey_missing',
                    message: `Journey ID '${journeyId}' no encontrado en la extensión.`
                }
            ]
        };
    }

    const plan = ClusivJourneyRuntime.buildJourneyExecutionPlan({
        journey,
        savedTexts,
        externalVariables: variables,
        finalText: options.textToPaste || null
    });

    return {
        ok: !plan.hasBlockingIssues,
        journey,
        plan,
        variables
    };
}

function summarizeValidationIssues(issues) {
    const blockingIssues = (issues || []).filter((issue) => issue.severity === 'error');
    if (blockingIssues.length === 0) {
        return 'Validación completada sin errores.';
    }

    return blockingIssues.map((issue) => issue.message).join(' | ');
}

function connectWebSocket() { 
    if (ws || isConnecting) return; 
    isConnecting = true; 
    notifyBackendStatusUpdated();
    
    console.log(`Intentando conectar a ${WS_URL}...`); 
    ws = new WebSocket(WS_URL); 

    ws.onopen = () => { 
        console.log("🟢 Conectado exitosamente al Orquestador Python."); 
        isConnecting = false; 
        updateBackendConnectionState({
            controlConnected: true,
            controlReadyState: WebSocket.OPEN
        });
        // Al conectar, enviamos inmediatamente la lista de journeys disponibles 
        sendJourneysToPython(); 
    }; 

    ws.onmessage = async (event) => { 
        try { 
            const msg = JSON.parse(event.data); 

            // Python solicita actualizar la lista de Journeys 
            if (msg.action === "GET_JOURNEYS") { 
                sendJourneysToPython(); 
            } 

            if (msg.action === "PREPARE_CHATGPT_TAB") {
                try {
                    await prepareChatGptTab(msg.tab_url_patterns || CHATGPT_TAB_PATTERNS);
                } catch (error) {
                    sendControlMessage({
                        action: 'CHATGPT_TAB_STATUS',
                        status: 'error',
                        message: error.message || 'No se pudo preparar la pestaña de ChatGPT.'
                    });
                }
            }

            if (msg.action === 'VALIDATE_JOURNEY' && msg.journey_id) {
                await sendValidationResultToPython(msg.journey_id, {
                    tabUrlPatterns: msg.tab_url_patterns || CHATGPT_TAB_PATTERNS
                });
            }

            // Python ordena ejecutar un Journey específico (y opcionalmente pegar texto al final) 
            if (msg.action === "RUN_JOURNEY" && msg.journey_id) { 
                executeJourney(msg.journey_id, msg.paste_text_at_end, {
                    tabUrlPatterns: msg.tab_url_patterns || CHATGPT_TAB_PATTERNS
                }); 
            } 

            // Python manda pegar directamente el texto (Botón Manual) 
            if (msg.action === "PASTE_TEXT_NOW" && msg.text) { 
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => { 
                    if (tabs.length === 0) { 
                        sendStatusToPython("error", "No hay pestaña activa para pegar el texto."); 
                        return;
                    }

                    try {
                        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "PASTE_TEXT", text: msg.text });
                        if (!response || response.status !== "pasted") {
                            const errorMessage = response?.message || "El contenido no pudo insertarse en el campo objetivo.";
                            sendStatusToPython("error", `Fallo al pegar: ${errorMessage}`);
                            return;
                        }

                        sendStatusToPython("paste_completed", "✅ Script pegado exitosamente en el campo activo.");
                    } catch (error) {
                        console.error("Error enviando PASTE_TEXT a la pestaña activa:", error);
                        sendStatusToPython("error", "Error de conexión al intentar pegar el texto.");
                    }
                }); 
            } 
        } catch (error) { 
            console.error("Error procesando mensaje del WS:", error); 
        } 
    }; 

    ws.onclose = () => { 
        console.log("🔴 Desconectado del servidor Python. Reintentando en 3s..."); 
        ws = null; 
        isConnecting = false; 
        updateBackendConnectionState({
            controlConnected: false,
            controlReadyState: WebSocket.CLOSED
        });
        // Bucle de reconexión automática 
        setTimeout(connectWebSocket, 3000); 
    }; 

    ws.onerror = (error) => { 
        console.error("⚠️ Error en WebSocket:", error); 
        updateBackendConnectionState({
            controlConnected: false,
            controlReadyState: WebSocket.CLOSING
        });
        if (ws) ws.close(); 
    }; 
} 

function connectTemplateWebSocket() {
    if (templateWs || isTemplateConnecting) return;
    isTemplateConnecting = true;
    notifyBackendStatusUpdated();

    console.log(`Intentando conectar a ${TEMPLATE_WS_URL} para variables externas...`);
    templateWs = new WebSocket(TEMPLATE_WS_URL);

    templateWs.onopen = () => {
        console.log('🟢 Conectado exitosamente al bridge de variables externas.');
        isTemplateConnecting = false;
        updateBackendConnectionState({
            templateConnected: true,
            templateReadyState: WebSocket.OPEN
        });
    };

    templateWs.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);

            if (msg.action === 'SYNC_TEMPLATE_VARIABLES' && msg.variables) {
                persistExternalVariables(
                    msg.variables,
                    msg.metadata || null,
                    msg.updatedAt || null
                );
            }
        } catch (error) {
            console.error('Error procesando mensaje del WS de variables:', error);
        }
    };

    templateWs.onclose = () => {
        console.log('🔴 Desconectado del bridge de variables. Reintentando en 3s...');
        templateWs = null;
        isTemplateConnecting = false;
        updateBackendConnectionState({
            templateConnected: false,
            templateReadyState: WebSocket.CLOSED
        });
        setTimeout(connectTemplateWebSocket, 3000);
    };

    templateWs.onerror = (error) => {
        console.error('⚠️ Error en WebSocket de variables:', error);
        updateBackendConnectionState({
            templateConnected: false,
            templateReadyState: WebSocket.CLOSING
        });
        if (templateWs) templateWs.close();
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.status === 'complete') {
            return tab;
        }
        await delay(300);
    }

    throw new Error('La pestaña objetivo no terminó de cargar a tiempo.');
}

async function findTargetTabByPatterns(patterns, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const tabs = await chrome.tabs.query({ url: patterns });
        if (tabs.length > 0) {
            return tabs[0];
        }
        await delay(400);
    }

    return null;
}

async function getPreferredChatGptTab(patterns) {
    if (!preferredChatGptTabId) {
        return null;
    }

    try {
        const tab = await chrome.tabs.get(preferredChatGptTabId);
        if (!tab || !tab.url) {
            preferredChatGptTabId = null;
            return null;
        }

        const matchesPattern = patterns.length === 0 || patterns.some((pattern) => {
            const prefix = pattern.replace('*', '');
            return tab.url.startsWith(prefix);
        });

        if (!matchesPattern) {
            preferredChatGptTabId = null;
            return null;
        }

        return tab;
    } catch (error) {
        preferredChatGptTabId = null;
        return null;
    }
}

async function prepareChatGptTab(tabUrlPatterns = CHATGPT_TAB_PATTERNS) {
    const patterns = Array.isArray(tabUrlPatterns) && tabUrlPatterns.length > 0
        ? tabUrlPatterns
        : CHATGPT_TAB_PATTERNS;

    let tab = await getPreferredChatGptTab(patterns);
    let status = 'ready';
    let message = 'Usando pestaña existente de ChatGPT.';

    if (!tab) {
        const existingTabs = await chrome.tabs.query({ url: patterns });
        if (existingTabs.length > 0) {
            tab = existingTabs[0];
        }
    }

    if (!tab) {
        tab = await chrome.tabs.create({ url: CHATGPT_HOME_URL, active: true });
        status = 'created';
        message = 'Se abrió una nueva pestaña de ChatGPT.';
    }

    preferredChatGptTabId = tab.id;

    if (typeof tab.windowId === 'number') {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {
        });
    }

    await chrome.tabs.update(tab.id, { active: true });
    const readyTab = tab.status === 'complete' ? tab : await waitForTabComplete(tab.id);

    preferredChatGptTabId = readyTab.id;
    sendControlMessage({
        action: 'CHATGPT_TAB_STATUS',
        status,
        tab_id: readyTab.id,
        url: readyTab.url,
        message
    });

    return readyTab;
}

async function resolveTargetTab(tabUrlPatterns = []) {
    const patterns = Array.isArray(tabUrlPatterns) && tabUrlPatterns.length > 0
        ? tabUrlPatterns
        : [];

    const preferredTab = await getPreferredChatGptTab(patterns);
    if (preferredTab) {
        await chrome.tabs.update(preferredTab.id, { active: true });
        return preferredTab.status === 'complete'
            ? preferredTab
            : await waitForTabComplete(preferredTab.id);
    }

    if (patterns.length > 0) {
        const matchingTab = await findTargetTabByPatterns(patterns);
        if (matchingTab) {
            preferredChatGptTabId = matchingTab.id;
            await chrome.tabs.update(matchingTab.id, { active: true });
            return matchingTab.status === 'complete'
                ? matchingTab
                : await waitForTabComplete(matchingTab.id);
        }
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
        return null;
    }

    preferredChatGptTabId = activeTab.id;

    return activeTab.status === 'complete'
        ? activeTab
        : await waitForTabComplete(activeTab.id);
}

async function validateJourneyExecution(journeyId, options = {}) {
    const preparation = await getExecutionPreparation(journeyId, options);
    const issues = preparation.issues ? [...preparation.issues] : [...(preparation.plan?.issues || [])];

    if (!preparation.journey || !preparation.plan) {
        return {
            ok: false,
            journeyId,
            issues,
            message: summarizeValidationIssues(issues) || preparation.error || 'No se pudo preparar la ejecución.'
        };
    }

    let tab = null;
    try {
        if (typeof options.preferredTabId === 'number') {
            tab = await chrome.tabs.get(options.preferredTabId);
        } else {
            tab = await resolveTargetTab(options.tabUrlPatterns || CHATGPT_TAB_PATTERNS);
        }
    } catch (error) {
        issues.push({
            severity: 'error',
            code: 'target_tab_unavailable',
            message: error.message || 'No se pudo preparar la pestaña objetivo.'
        });
    }

    if (!tab) {
        issues.push({
            severity: 'error',
            code: 'target_tab_missing',
            message: 'No se encontró una pestaña lista para ejecutar el journey.'
        });
    }

    let contentValidation = null;
    if (tab) {
        try {
            contentValidation = await chrome.tabs.sendMessage(tab.id, {
                action: 'VALIDATE_EXECUTION_PLAN',
                steps: preparation.plan.steps
            });
        } catch (error) {
            issues.push({
                severity: 'error',
                code: 'content_script_unavailable',
                message: 'La pestaña objetivo no respondió a la validación del sitio.'
            });
        }
    }

    if (contentValidation?.steps) {
        contentValidation.steps.forEach((stepValidation) => {
            if (stepValidation.status !== 'ok') {
                issues.push({
                    severity: 'error',
                    code: stepValidation.code || 'site_validation_failed',
                    stepIndex: stepValidation.stepIndex,
                    message: `Paso ${stepValidation.stepIndex + 1}: ${stepValidation.message}`
                });
            }
        });
    }

    return {
        ok: !issues.some((issue) => issue.severity === 'error'),
        journeyId,
        journeyName: preparation.plan.journeyName,
        requiredVariables: preparation.plan.requiredVariables,
        missingVariables: preparation.plan.missingVariables,
        missingTexts: preparation.plan.missingTexts,
        issues,
        tabId: tab?.id || null,
        page: contentValidation?.page || (tab ? { url: tab.url, title: tab.title || '' } : null),
        message: summarizeValidationIssues(issues)
    };
}

async function sendValidationResultToPython(journeyId, options = {}) {
    const validation = await validateJourneyExecution(journeyId, options);
    sendControlMessage({
        action: 'EXECUTION_VALIDATION_RESULT',
        journey_id: journeyId,
        status: validation.ok ? 'ok' : 'error',
        message: validation.message,
        issues: validation.issues,
        required_variables: validation.requiredVariables || [],
        missing_variables: validation.missingVariables || [],
        missing_texts: validation.missingTexts || [],
        page: validation.page || null,
        tab_id: validation.tabId || null
    });
    return validation;
}

// ========================================== 
// --- FUNCIONES DE COMUNICACIÓN Y EJECUCIÓN --- 
// ========================================== 

/** 
 * Lee los Journeys del storage local y los envía al servidor Python 
 */ 
function sendJourneysToPython() { 
    chrome.storage.local.get(['savedJourneys'], (res) => { 
        if (ws && ws.readyState === WebSocket.OPEN) { 
            ws.send(JSON.stringify({ 
                action: "JOURNEYS_LIST", 
                data: res.savedJourneys ||[] 
            })); 
        } 
    }); 
} 

/** 
 * Busca un Journey por ID y ordena al content.js ejecutar cada paso 
 * @param {string} journeyId - El ID del journey a ejecutar 
 * @param {string} textToPaste - Texto opcional para pegar al final del journey 
 */ 
async function executeJourney(journeyId, textToPaste, options = {}) { 
    const preparation = await getExecutionPreparation(journeyId, {
        ...options,
        textToPaste
    });

    if (!preparation.journey || !preparation.plan) {
        sendStatusToPython("error", preparation.error || summarizeValidationIssues(preparation.issues || []), journeyId);
        return;
    }

    const journey = preparation.journey;
    const plan = preparation.plan;

    if (plan.hasBlockingIssues) {
        sendStatusToPython("error", summarizeValidationIssues(plan.issues), journeyId);
        return;
    }

    if (!sendStatusToPython("started", `Iniciando secuencia: ${journey.name} (${plan.steps.length} pasos)`, journeyId)) {
        return;
    }

    let tab;
    try {
        if (typeof options.preferredTabId === 'number') {
            tab = await chrome.tabs.get(options.preferredTabId);
        } else {
            tab = await resolveTargetTab(options.tabUrlPatterns || CHATGPT_TAB_PATTERNS);
        }
    } catch (error) {
        sendStatusToPython("error", error.message || "No se pudo preparar la pestaña objetivo.", journeyId);
        return;
    }

    if (!tab) {
        sendStatusToPython("error", "No se encontró una pestaña de ChatGPT lista para ejecutar el journey.", journeyId);
        return;
    }

    let shouldStopExecution = false;
    const executionResult = await ClusivJourneyRuntime.executeJourneyPlan({
        plan,
        sendToTab: (payload) => chrome.tabs.sendMessage(tab.id, payload),
        shouldStop: () => shouldStopExecution,
        onStepStart: (step, stepIndex, totalSteps) => {
            const statusSent = sendStatusToPython(
                "progress",
                `Ejecutando paso ${stepIndex + 1}/${totalSteps}: ${ClusivJourneyRuntime.getStepDisplayLabel(step)}`,
                journeyId
            );
            if (!statusSent) {
                shouldStopExecution = true;
            }
        }
    });

    if (executionResult.status === 'stopped') {
        return;
    }

    if (executionResult.status === 'error') {
        sendStatusToPython("error", executionResult.message || "El journey fallo durante la ejecucion.", journeyId);
        return;
    }

    if (plan.finalText) {
        if (!sendStatusToPython("paste_completed", "Script pegado correctamente", journeyId)) {
            return;
        }
    }

    sendStatusToPython("completed", `✅ Secuencia finalizada: ${journey.name}`, journeyId);
} 

/** 
 * Función auxiliar para enviar estados a Python 
 */ 
function sendStatusToPython(statusType, messageStr, journeyId = null) { 
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("No se pudo enviar el estado al backend: WebSocket no disponible.", { statusType, journeyId });
        return false;
    }

    const payload = { 
        action: "JOURNEY_STATUS", 
        status: statusType, 
        message: messageStr 
    };

    if (journeyId) {
        payload.journey_id = journeyId;
    }

    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch (error) {
        console.error("No se pudo enviar el estado al backend.", { statusType, journeyId, error });
        return false;
    }
} 

// ========================================== 
// --- INICIALIZACIÓN --- 
// ========================================== 

// Mantener vivo el Service Worker respondiendo a eventos de instalación/activación 
chrome.runtime.onInstalled.addListener(() => { 
    connectWebSocket(); 
    connectTemplateWebSocket();
}); 

chrome.runtime.onStartup.addListener(() => { 
    connectWebSocket(); 
    connectTemplateWebSocket();
}); 

// Iniciar conexión inmediatamente cuando se despierte el background script 
connectWebSocket(); 
connectTemplateWebSocket();
notifyBackendStatusUpdated();

// ==========================================
// --- HANDLER DE MENSAJES INTERNOS (SIDEPANEL → BACKGROUND) ---
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_ACTIVE_TAB_CONTEXT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                sendResponse({ url: "unknown", origin: "unknown", page_title: "unknown" });
                return;
            }

            const tab = tabs[0];
            let origin = "unknown";

            try {
                origin = new URL(tab.url).origin;
            } catch (e) {
            }

            sendResponse({
                url: tab.url || "unknown",
                origin,
                page_title: tab.title || "unknown"
            });
        });

        return true;
    }

    if (request.action === 'GET_EXTERNAL_VARIABLES') {
        sendResponse({
            variables: externalVariablesCache
        });
        return false;
    }

    if (request.action === 'GET_BACKEND_STATUS') {
        sendResponse(getBackendStatus());
        return false;
    }
});