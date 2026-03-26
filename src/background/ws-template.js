import { ClusivLogger } from '../shared/debug-logger.js';
import { TEMPLATE_WS_URL } from './constants.js';
import * as state from './state.js';

function notifyExternalVariablesUpdated() {
    chrome.runtime.sendMessage({
        action: 'EXTERNAL_VARIABLES_UPDATED',
        variables: state.externalVariablesCache
    }).catch(() => {
    });
}

function notifyBackendStatusUpdated() {
    chrome.runtime.sendMessage({
        action: 'BACKEND_STATUS_UPDATED',
        state: state.getBackendStatus()
    }).catch(() => {
    });
}

export function sendTemplateSyncAck(updatedAt, variableNames = [], requestId = null) {
    if (!updatedAt || !state.templateWs || state.templateWs.readyState !== WebSocket.OPEN) {
        ClusivLogger.warning('template_sync_ack_skipped', {
            updatedAt,
            request_id: requestId,
            template_ready_state: state.templateWs?.readyState ?? null
        });
        return;
    }

    const payload = {
        action: 'TEMPLATE_VARIABLES_SYNCED',
        updatedAt,
        variableNames,
        request_id: requestId
    };

    state.templateWs.send(JSON.stringify(payload));
    ClusivLogger.debug('template_sync_ack_sent', {
        updatedAt,
        request_id: requestId,
        variable_names: variableNames
    });
}

export function persistExternalVariables(incomingVariables, metadata = null, updatedAt = null, requestId = null) {
    if (!incomingVariables || typeof incomingVariables !== 'object') {
        ClusivLogger.warning('external_variables_persist_skipped', {
            reason: 'invalid_payload'
        });
        return;
    }

    state.setExternalVariablesCache({
        ...state.externalVariablesCache,
        ...incomingVariables
    });

    chrome.storage.local.set({
        externalVariables: state.externalVariablesCache,
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

export function connectTemplateWebSocket() {
    if (state.templateWs || state.isTemplateConnecting) {
        return;
    }

    state.setIsTemplateConnecting(true);
    notifyBackendStatusUpdated();
    ClusivLogger.info('ws_template_connecting', { url: TEMPLATE_WS_URL });

    console.log(`Intentando conectar a ${TEMPLATE_WS_URL} para variables externas...`);
    const socket = new WebSocket(TEMPLATE_WS_URL);
    state.setTemplateWs(socket);

    socket.onopen = () => {
        ClusivLogger.info('ws_template_connected', { url: TEMPLATE_WS_URL });
        console.log('🟢 Conectado exitosamente al bridge de variables externas.');
        state.setIsTemplateConnecting(false);
        state.updateBackendConnectionState({
            templateConnected: true,
            templateReadyState: WebSocket.OPEN
        });
        notifyBackendStatusUpdated();
    };

    socket.onmessage = async (event) => {
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

    socket.onclose = () => {
        ClusivLogger.warning('ws_template_disconnected', {
            url: TEMPLATE_WS_URL,
            willReconnect: true,
            reconnectDelayMs: 3000
        });
        console.log('🔴 Desconectado del bridge de variables. Reintentando en 3s...');
        state.setTemplateWs(null);
        state.setIsTemplateConnecting(false);
        state.updateBackendConnectionState({
            templateConnected: false,
            templateReadyState: WebSocket.CLOSED
        });
        notifyBackendStatusUpdated();
        setTimeout(connectTemplateWebSocket, 3000);
    };

    socket.onerror = (error) => {
        ClusivLogger.error('ws_template_error', { url: TEMPLATE_WS_URL, error: String(error) });
        console.error('⚠️ Error en WebSocket de variables:', error);
        state.updateBackendConnectionState({
            templateConnected: false,
            templateReadyState: WebSocket.CLOSING
        });
        notifyBackendStatusUpdated();
        socket.close();
    };
}