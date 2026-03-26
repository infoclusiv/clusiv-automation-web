import { ClusivLogger } from '../shared/debug-logger.js';
import { CHATGPT_TAB_PATTERNS, WS_URL } from './constants.js';
import { executeJourney } from './journey-executor.js';
import { sendJourneysToPython, sendStatusToPython, sendValidationResultToPython } from './python-bridge.js';
import { prepareChatGptTab } from './tab-manager.js';
import * as state from './state.js';

function notifyBackendStatusUpdated() {
    chrome.runtime.sendMessage({
        action: 'BACKEND_STATUS_UPDATED',
        state: state.getBackendStatus()
    }).catch(() => {
    });
}

export function sendControlMessage(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        ClusivLogger.error('control_message_send_skipped', {
            reason: 'ws_unavailable',
            action: payload?.action || null,
            request_id: payload?.request_id || null,
            execution_id: payload?.execution_id || null
        });
        return false;
    }

    try {
        state.ws.send(JSON.stringify(payload));
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

export function connectWebSocket() {
    if (state.ws || state.isConnecting) {
        return;
    }

    state.setIsConnecting(true);
    notifyBackendStatusUpdated();
    ClusivLogger.info('ws_control_connecting', { url: WS_URL });

    console.log(`Intentando conectar a ${WS_URL}...`);
    const socket = new WebSocket(WS_URL);
    state.setWs(socket);

    socket.onopen = () => {
        ClusivLogger.info('ws_control_connected', { url: WS_URL });
        console.log('🟢 Conectado exitosamente al Orquestador Python.');
        state.setIsConnecting(false);
        state.updateBackendConnectionState({
            controlConnected: true,
            controlReadyState: WebSocket.OPEN
        });
        notifyBackendStatusUpdated();
        sendJourneysToPython();
    };

    socket.onmessage = async (event) => {
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

            if (msg.action === 'GET_JOURNEYS') {
                sendJourneysToPython(msg.request_id || null);
                return;
            }

            if (msg.action === 'PREPARE_CHATGPT_TAB') {
                try {
                    const result = await prepareChatGptTab(msg.tab_url_patterns || CHATGPT_TAB_PATTERNS, msg.request_id || null);
                    sendControlMessage({
                        action: 'CHATGPT_TAB_STATUS',
                        request_id: msg.request_id || null,
                        status: result.status,
                        tab_id: result.tab.id,
                        url: result.tab.url,
                        message: result.message
                    });
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
                return;
            }

            if (msg.action === 'VALIDATE_JOURNEY' && msg.journey_id) {
                await sendValidationResultToPython(msg.journey_id, {
                    requestId: msg.request_id || null,
                    tabUrlPatterns: msg.tab_url_patterns || CHATGPT_TAB_PATTERNS
                });
                return;
            }

            if (msg.action === 'RUN_JOURNEY' && msg.journey_id) {
                ClusivLogger.journey('run_journey_command_received', {
                    journey_id: msg.journey_id,
                    execution_id: msg.execution_id || null,
                    request_id: msg.request_id || null
                });
                executeJourney(msg.journey_id, msg.paste_text_at_end, {
                    executionId: msg.execution_id || null,
                    tabUrlPatterns: msg.tab_url_patterns || CHATGPT_TAB_PATTERNS
                });
                return;
            }

            if (msg.action === 'PASTE_TEXT_NOW' && msg.text) {
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                    if (tabs.length === 0) {
                        sendStatusToPython('error', 'No hay pestaña activa para pegar el texto.');
                        return;
                    }

                    try {
                        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'PASTE_TEXT', text: msg.text });
                        if (!response || response.status !== 'pasted') {
                            const errorMessage = response?.message || 'El contenido no pudo insertarse en el campo objetivo.';
                            sendStatusToPython('error', `Fallo al pegar: ${errorMessage}`);
                            return;
                        }

                        sendStatusToPython('paste_completed', '✅ Script pegado exitosamente en el campo activo.');
                    } catch (error) {
                        console.error('Error enviando PASTE_TEXT a la pestaña activa:', error);
                        sendStatusToPython('error', 'Error de conexión al intentar pegar el texto.');
                    }
                });
            }
        } catch (error) {
            ClusivLogger.error('ws_message_processing_failed', { error: String(error) });
            console.error('Error procesando mensaje del WS:', error);
        }
    };

    socket.onclose = () => {
        ClusivLogger.warning('ws_control_disconnected', {
            url: WS_URL,
            willReconnect: true,
            reconnectDelayMs: 3000
        });
        console.log('🔴 Desconectado del servidor Python. Reintentando en 3s...');
        state.setWs(null);
        state.setIsConnecting(false);
        state.updateBackendConnectionState({
            controlConnected: false,
            controlReadyState: WebSocket.CLOSED
        });
        notifyBackendStatusUpdated();
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        ClusivLogger.error('ws_control_error', { url: WS_URL, error: String(error) });
        console.error('⚠️ Error en WebSocket:', error);
        state.updateBackendConnectionState({
            controlConnected: false,
            controlReadyState: WebSocket.CLOSING
        });
        notifyBackendStatusUpdated();
        socket.close();
    };
}