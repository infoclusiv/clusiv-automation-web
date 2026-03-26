import { ClusivLogger } from '../shared/debug-logger.js';
import { ClusivJourneyRuntime } from '../shared/journey-runtime.js';
// Configuración para abrir el panel lateral al hacer clic en el icono 
chrome.sidePanel 
  .setPanelBehavior({ openPanelOnActionClick: true }) 
  .catch((error) => console.error(error)); 


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
const KEEPALIVE_ALARM_NAME = 'keepAlive';
const backendConnectionState = {
    controlConnected: false,
    templateConnected: false,
    controlReadyState: WebSocket.CLOSED,
    templateReadyState: WebSocket.CLOSED
};
let preferredChatGptTabId = null;
const WS_URL = 'ws://localhost:8765'; 
const TEMPLATE_WS_URL = 'ws://localhost:8766';

chrome.storage.session.get(['preferredChatGptTabId'], (res) => {
    if (typeof res.preferredChatGptTabId === 'number') {
        preferredChatGptTabId = res.preferredChatGptTabId;
    }
});

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

function setPreferredChatGptTabId(tabId) {
    preferredChatGptTabId = typeof tabId === 'number' ? tabId : null;

    if (preferredChatGptTabId !== null) {
        chrome.storage.session.set({ preferredChatGptTabId });
        return;
    }

    chrome.storage.session.remove('preferredChatGptTabId');
}

function sendControlMessage(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        ClusivLogger.error('control_message_send_skipped', {
            reason: 'ws_unavailable',
            action: payload?.action || null,
            request_id: payload?.request_id || null,
            execution_id: payload?.execution_id || null
        });
        return false;
    }

    try {
        ws.send(JSON.stringify(payload));
        ClusivLogger.debug('control_message_sent', {
            action: payload.action || null,
            request_id: payload.request_id || null,
            execution_id: payload.execution_id || null,
            journey_id: payload.journey_id || null
        });
        return true;
    } catch (error) {
        ClusivLogger.error('control_message_send_failed', {
            action: payload?.action || null,
            request_id: payload?.request_id || null,
            execution_id: payload?.execution_id || null,
            error: String(error)
        });
        console.error('No se pudo enviar mensaje al backend.', { payload, error });
        return false;
    }
}

function sendTemplateSyncAck(updatedAt, variableNames = [], requestId = null) {
    if (!updatedAt || !templateWs || templateWs.readyState !== WebSocket.OPEN) {
        ClusivLogger.warning('template_sync_ack_skipped', {
            updatedAt,
            request_id: requestId,
            template_ready_state: templateWs?.readyState ?? null
        });
        return;
    }

    const payload = {
        action: 'TEMPLATE_VARIABLES_SYNCED',
        updatedAt,
        variableNames,
        request_id: requestId
    };

    templateWs.send(JSON.stringify(payload));
    ClusivLogger.debug('template_sync_ack_sent', {
        updatedAt,
        request_id: requestId,
        variable_names: variableNames
    });
}

function persistExternalVariables(incomingVariables, metadata = null, updatedAt = null, requestId = null) {
    if (!incomingVariables || typeof incomingVariables !== 'object') {
        ClusivLogger.warning('external_variables_persist_skipped', {
            reason: 'invalid_payload'
        });
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
        ClusivLogger.info('external_variables_persisted', {
            variable_names: Object.keys(incomingVariables),
            updatedAt,
            request_id: requestId
        });
        notifyExternalVariablesUpdated();
        sendTemplateSyncAck(updatedAt, Object.keys(incomingVariables), requestId);
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
    ClusivLogger.info('ws_control_connecting', { url: WS_URL });
    
    console.log(`Intentando conectar a ${WS_URL}...`); 
    ws = new WebSocket(WS_URL); 

    ws.onopen = () => { 
        ClusivLogger.info('ws_control_connected', { url: WS_URL });
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
            ClusivLogger.debug('ws_message_received', {
                action: msg.action || null,
                request_id: msg.request_id || null,
                execution_id: msg.execution_id || null,
                journey_id: msg.journey_id || null
            });

            if (msg.action === 'HEARTBEAT') {
                ClusivLogger.debug('heartbeat_received', { ts: msg.ts || null });
                sendControlMessage({ action: 'HEARTBEAT_ACK', ts: msg.ts || Date.now() });
                return;
            }

            // Python solicita actualizar la lista de Journeys 
            if (msg.action === "GET_JOURNEYS") { 
                sendJourneysToPython(msg.request_id || null); 
            } 

            if (msg.action === "PREPARE_CHATGPT_TAB") {
                try {
                    await prepareChatGptTab(msg.tab_url_patterns || CHATGPT_TAB_PATTERNS, msg.request_id || null);
                } catch (error) {
                    ClusivLogger.error('prepare_chatgpt_tab_failed', {
                        request_id: msg.request_id || null,
                        error: error.message || String(error)
                    });
                    sendControlMessage({
                        action: 'CHATGPT_TAB_STATUS',
                        request_id: msg.request_id || null,
                        status: 'error',
                        message: error.message || 'No se pudo preparar la pestaña de ChatGPT.'
                    });
                }
            }

            if (msg.action === 'VALIDATE_JOURNEY' && msg.journey_id) {
                await sendValidationResultToPython(msg.journey_id, {
                    requestId: msg.request_id || null,
                    tabUrlPatterns: msg.tab_url_patterns || CHATGPT_TAB_PATTERNS
                });
            }

            // Python ordena ejecutar un Journey específico (y opcionalmente pegar texto al final) 
            if (msg.action === "RUN_JOURNEY" && msg.journey_id) { 
                ClusivLogger.journey('run_journey_command_received', {
                    journey_id: msg.journey_id,
                    execution_id: msg.execution_id || null,
                    request_id: msg.request_id || null
                });
                executeJourney(msg.journey_id, msg.paste_text_at_end, {
                    executionId: msg.execution_id || null,
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
            ClusivLogger.error('ws_message_processing_failed', { error: String(error) });
            console.error("Error procesando mensaje del WS:", error); 
        } 
    }; 

    ws.onclose = () => { 
        ClusivLogger.warning('ws_control_disconnected', {
            url: WS_URL,
            willReconnect: true,
            reconnectDelayMs: 3000
        });
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
        ClusivLogger.error('ws_control_error', { url: WS_URL, error: String(error) });
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
    ClusivLogger.info('ws_template_connecting', { url: TEMPLATE_WS_URL });

    console.log(`Intentando conectar a ${TEMPLATE_WS_URL} para variables externas...`);
    templateWs = new WebSocket(TEMPLATE_WS_URL);

    templateWs.onopen = () => {
        ClusivLogger.info('ws_template_connected', { url: TEMPLATE_WS_URL });
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
            ClusivLogger.debug('template_message_received', {
                action: msg.action || null,
                request_id: msg.request_id || null,
                updatedAt: msg.updatedAt || null
            });

            if (msg.action === 'SYNC_TEMPLATE_VARIABLES' && msg.variables) {
                persistExternalVariables(
                    msg.variables,
                    msg.metadata || null,
                    msg.updatedAt || null,
                    msg.request_id || null
                );
            }
        } catch (error) {
            ClusivLogger.error('template_message_processing_failed', { error: String(error) });
            console.error('Error procesando mensaje del WS de variables:', error);
        }
    };

    templateWs.onclose = () => {
        ClusivLogger.warning('ws_template_disconnected', {
            url: TEMPLATE_WS_URL,
            willReconnect: true,
            reconnectDelayMs: 3000
        });
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
        ClusivLogger.error('ws_template_error', { url: TEMPLATE_WS_URL, error: String(error) });
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
            setPreferredChatGptTabId(null);
            return null;
        }

        const matchesPattern = patterns.length === 0 || patterns.some((pattern) => {
            const prefix = pattern.replace('*', '');
            return tab.url.startsWith(prefix);
        });

        if (!matchesPattern) {
            setPreferredChatGptTabId(null);
            return null;
        }

        return tab;
    } catch (error) {
        setPreferredChatGptTabId(null);
        return null;
    }
}

async function prepareChatGptTab(tabUrlPatterns = CHATGPT_TAB_PATTERNS, requestId = null) {
    const patterns = Array.isArray(tabUrlPatterns) && tabUrlPatterns.length > 0
        ? tabUrlPatterns
        : CHATGPT_TAB_PATTERNS;

    ClusivLogger.info('prepare_chatgpt_tab_start', {
        request_id: requestId,
        patterns
    });

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

    setPreferredChatGptTabId(tab.id);

    if (typeof tab.windowId === 'number') {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {
        });
    }

    await chrome.tabs.update(tab.id, { active: true });
    const readyTab = tab.status === 'complete' ? tab : await waitForTabComplete(tab.id);

    setPreferredChatGptTabId(readyTab.id);
    ClusivLogger.info('prepare_chatgpt_tab_ready', {
        request_id: requestId,
        tab_id: readyTab.id,
        url: readyTab.url,
        status
    });
    sendControlMessage({
        action: 'CHATGPT_TAB_STATUS',
        request_id: requestId,
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
            setPreferredChatGptTabId(matchingTab.id);
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

    setPreferredChatGptTabId(activeTab.id);

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
    ClusivLogger.info('validation_result_ready', {
        journey_id: journeyId,
        request_id: options.requestId || null,
        status: validation.ok ? 'ok' : 'error',
        issues: validation.issues?.length || 0
    });
    sendControlMessage({
        action: 'EXECUTION_VALIDATION_RESULT',
        request_id: options.requestId || null,
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
function sendJourneysToPython(requestId = null) { 
    chrome.storage.local.get(['savedJourneys'], (res) => { 
        if (ws && ws.readyState === WebSocket.OPEN) { 
            const payload = { 
                action: "JOURNEYS_LIST", 
                data: res.savedJourneys ||[] 
            };

            if (requestId) {
                payload.request_id = requestId;
            }

            ClusivLogger.info('journeys_list_sent', {
                request_id: requestId,
                count: payload.data.length
            });
            ws.send(JSON.stringify(payload)); 
            return;
        } 

        ClusivLogger.warning('journeys_list_send_skipped', {
            request_id: requestId,
            reason: 'ws_unavailable'
        });
    }); 
} 

/** 
 * Busca un Journey por ID y ordena al content.js ejecutar cada paso 
 * @param {string} journeyId - El ID del journey a ejecutar 
 * @param {string} textToPaste - Texto opcional para pegar al final del journey 
 */ 
async function executeJourney(journeyId, textToPaste, options = {}) { 
    const executionId = options.executionId || null;

    ClusivLogger.journey('execute_journey_start', {
        journey_id: journeyId,
        execution_id: executionId,
        has_text_to_paste: Boolean(textToPaste)
    });

    const preparation = await getExecutionPreparation(journeyId, {
        ...options,
        textToPaste
    });

    if (!preparation.journey || !preparation.plan) {
        ClusivLogger.error('execute_journey_preparation_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: preparation.error || summarizeValidationIssues(preparation.issues || [])
        });
        sendStatusToPython("error", preparation.error || summarizeValidationIssues(preparation.issues || []), journeyId, executionId);
        return;
    }

    const journey = preparation.journey;
    const plan = preparation.plan;

    if (plan.hasBlockingIssues) {
        ClusivLogger.error('execute_journey_blocked', {
            journey_id: journeyId,
            execution_id: executionId,
            issues: plan.issues || []
        });
        sendStatusToPython("error", summarizeValidationIssues(plan.issues), journeyId, executionId);
        return;
    }

    if (!sendStatusToPython("started", `Iniciando secuencia: ${journey.name} (${plan.steps.length} pasos)`, journeyId, executionId)) {
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
        ClusivLogger.error('execute_journey_target_tab_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: error.message || String(error)
        });
        sendStatusToPython("error", error.message || "No se pudo preparar la pestaña objetivo.", journeyId, executionId);
        return;
    }

    if (!tab) {
        ClusivLogger.error('execute_journey_target_tab_missing', {
            journey_id: journeyId,
            execution_id: executionId
        });
        sendStatusToPython("error", "No se encontró una pestaña de ChatGPT lista para ejecutar el journey.", journeyId, executionId);
        return;
    }

    ClusivLogger.journey('execute_journey_target_tab_ready', {
        journey_id: journeyId,
        execution_id: executionId,
        tab_id: tab.id,
        url: tab.url || null,
        step_count: plan.steps.length
    });

    let shouldStopExecution = false;
    const executionResult = await ClusivJourneyRuntime.executeJourneyPlan({
        plan,
        sendToTab: (payload) => chrome.tabs.sendMessage(tab.id, payload),
        shouldStop: () => shouldStopExecution,
        onStepStart: (step, stepIndex, totalSteps) => {
            ClusivLogger.journey('journey_step_started', {
                journey_id: journeyId,
                execution_id: executionId,
                step_index: stepIndex,
                total_steps: totalSteps,
                step_type: step.stepType || null,
                label: ClusivJourneyRuntime.getStepDisplayLabel(step)
            });
            const statusSent = sendStatusToPython(
                "progress",
                `Ejecutando paso ${stepIndex + 1}/${totalSteps}: ${ClusivJourneyRuntime.getStepDisplayLabel(step)}`,
                journeyId,
                executionId
            );
            if (!statusSent) {
                ClusivLogger.error('journey_step_status_send_failed', {
                    journey_id: journeyId,
                    execution_id: executionId,
                    step_index: stepIndex
                });
                shouldStopExecution = true;
            }
        }
    });

    if (executionResult.status === 'stopped') {
        ClusivLogger.warning('execute_journey_stopped', {
            journey_id: journeyId,
            execution_id: executionId
        });
        return;
    }

    if (executionResult.status === 'error') {
        ClusivLogger.error('execute_journey_failed', {
            journey_id: journeyId,
            execution_id: executionId,
            error: executionResult.message || 'El journey fallo durante la ejecucion.'
        });
        sendStatusToPython("error", executionResult.message || "El journey fallo durante la ejecucion.", journeyId, executionId);
        return;
    }

    if (plan.finalText) {
        if (!sendStatusToPython("paste_completed", "Script pegado correctamente", journeyId, executionId)) {
            return;
        }
    }

    ClusivLogger.journey('journey_execution_completed', {
        journey_id: journeyId,
        execution_id: executionId,
        final_status: executionResult.status
    });
    sendStatusToPython("completed", `✅ Secuencia finalizada: ${journey.name}`, journeyId, executionId);
} 

/** 
 * Función auxiliar para enviar estados a Python 
 */ 
function sendStatusToPython(statusType, messageStr, journeyId = null, executionId = null) { 
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        ClusivLogger.error('send_status_ws_unavailable', {
            status: statusType,
            journey_id: journeyId,
            execution_id: executionId
        });
        console.error("No se pudo enviar el estado al backend: WebSocket no disponible.", { statusType, journeyId, executionId });
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

    if (executionId) {
        payload.execution_id = executionId;
    }

    try {
        ws.send(JSON.stringify(payload));
        ClusivLogger.journey('send_status_sent', {
            status: statusType,
            journey_id: journeyId,
            execution_id: executionId,
            message: messageStr
        });
        return true;
    } catch (error) {
        ClusivLogger.error('send_status_exception', {
            status: statusType,
            journey_id: journeyId,
            execution_id: executionId,
            error: String(error)
        });
        console.error("No se pudo enviar el estado al backend.", { statusType, journeyId, executionId, error });
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

chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM_NAME) {
        return;
    }

    if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
    }

    if (!templateWs || templateWs.readyState === WebSocket.CLOSED) {
        connectTemplateWebSocket();
    }
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

    if (request.action === 'GET_DEBUG_LOGS') {
        sendResponse({ logs: ClusivLogger.getBuffer() });
        return false;
    }
});
