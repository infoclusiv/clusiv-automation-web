import { refs } from './dom-refs.js';

export function renderBackendStatus(state) {
    const control = state.controlConnected ? 'principal conectado' : 'principal desconectado';
    const template = state.templateConnected ? 'variables conectadas' : 'variables desconectadas';
    let suffix = '';

    if (!state.controlConnected && state.isConnecting) {
        suffix = ' · reconectando';
    }

    refs.backendStatus.textContent = `Backend: ${control} | ${template}${suffix}`;
}

export function initBackendStatus() {
    renderBackendStatus({
        controlConnected: false,
        templateConnected: false,
        isConnecting: true,
        isTemplateConnecting: true
    });

    chrome.runtime.sendMessage({ action: 'GET_BACKEND_STATUS' }, (response) => {
        if (chrome.runtime.lastError || !response) {
            return;
        }
        renderBackendStatus(response);
    });
}