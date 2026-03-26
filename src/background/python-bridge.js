import { ClusivLogger } from '../shared/debug-logger.js';
import * as state from './state.js';
import { validateJourneyExecution } from './journey-executor.js';

function sendPayload(payload, errorEvent, errorDetails) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        ClusivLogger.error(errorEvent, errorDetails);
        return false;
    }

    try {
        state.ws.send(JSON.stringify(payload));
        return true;
    } catch (error) {
        ClusivLogger.error(`${errorEvent}_exception`, {
            ...errorDetails,
            error: String(error)
        });
        return false;
    }
}

export function sendStatusToPython(statusType, messageStr, journeyId = null, executionId = null) {
    const payload = {
        action: 'JOURNEY_STATUS',
        status: statusType,
        message: messageStr
    };

    if (journeyId) {
        payload.journey_id = journeyId;
    }

    if (executionId) {
        payload.execution_id = executionId;
    }

    const sent = sendPayload(payload, 'send_status_ws_unavailable', {
        status: statusType,
        journey_id: journeyId,
        execution_id: executionId
    });

    if (sent) {
        ClusivLogger.journey('send_status_sent', {
            status: statusType,
            journey_id: journeyId,
            execution_id: executionId,
            message: messageStr
        });
    } else {
        console.error('No se pudo enviar el estado al backend.', { statusType, journeyId, executionId });
    }

    return sent;
}

export function sendJourneysToPython(requestId = null) {
    chrome.storage.local.get(['savedJourneys'], (res) => {
        const payload = {
            action: 'JOURNEYS_LIST',
            data: res.savedJourneys || []
        };

        if (requestId) {
            payload.request_id = requestId;
        }

        const sent = sendPayload(payload, 'journeys_list_send_skipped', {
            request_id: requestId,
            reason: 'ws_unavailable'
        });

        if (sent) {
            ClusivLogger.info('journeys_list_sent', {
                request_id: requestId,
                count: payload.data.length
            });
        }
    });
}

export async function sendValidationResultToPython(journeyId, options = {}) {
    const validation = await validateJourneyExecution(journeyId, options);
    ClusivLogger.info('validation_result_ready', {
        journey_id: journeyId,
        request_id: options.requestId || null,
        status: validation.ok ? 'ok' : 'error',
        issues: validation.issues?.length || 0
    });

    sendPayload({
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
    }, 'validation_result_send_skipped', {
        journey_id: journeyId,
        request_id: options.requestId || null,
        reason: 'ws_unavailable'
    });

    return validation;
}