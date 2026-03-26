import { ClusivJourneyRuntime } from '../shared/journey-runtime.js';
import * as state from './state.js';

export function loadExternalVariables() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['externalVariables'], (res) => {
            state.setExternalVariables(res.externalVariables || {});
            resolve(state.externalVariables);
        });
    });
}

export function resolveTemplateVariables(content) {
    return ClusivJourneyRuntime.resolveTemplateVariables(content, state.externalVariables).content;
}

export function initExternalVariables() {
    loadExternalVariables();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.externalVariables) {
            return;
        }

        state.setExternalVariables(changes.externalVariables.newValue || {});
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'EXTERNAL_VARIABLES_UPDATED') {
            state.setExternalVariables(request.variables || {});
        }
    });
}