import { ClusivLogger } from '../shared/debug-logger.js';
import { sendJourneysToPython } from './python-bridge.js';
import * as state from './state.js';

export function registerMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_ACTIVE_TAB_CONTEXT') {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) {
                    sendResponse({ url: 'unknown', origin: 'unknown', page_title: 'unknown' });
                    return;
                }

                const tab = tabs[0];
                let origin = 'unknown';

                try {
                    origin = new URL(tab.url).origin;
                } catch {
                }

                sendResponse({
                    url: tab.url || 'unknown',
                    origin,
                    page_title: tab.title || 'unknown'
                });
            });

            return true;
        }

        if (request.action === 'GET_EXTERNAL_VARIABLES') {
            sendResponse({
                variables: state.externalVariablesCache
            });
            return false;
        }

        if (request.action === 'GET_BACKEND_STATUS') {
            sendResponse(state.getBackendStatus());
            return false;
        }

        if (request.action === 'GET_DEBUG_LOGS') {
            sendResponse({ logs: ClusivLogger.getBuffer() });
            return false;
        }

        if (request.action === 'SYNC_JOURNEYS_TO_BACKEND') {
            sendJourneysToPython();
            sendResponse({ status: 'synced' });
            return false;
        }

        return false;
    });
}