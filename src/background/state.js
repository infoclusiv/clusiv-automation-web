export const backendConnectionState = {
    controlConnected: false,
    templateConnected: false,
    controlReadyState: WebSocket.CLOSED,
    templateReadyState: WebSocket.CLOSED
};

export let ws = null;
export let isConnecting = false;
export let templateWs = null;
export let isTemplateConnecting = false;
export let externalVariablesCache = {};
export let preferredChatGptTabId = null;

export function setWs(value) {
    ws = value;
}

export function setIsConnecting(value) {
    isConnecting = value;
}

export function setTemplateWs(value) {
    templateWs = value;
}

export function setIsTemplateConnecting(value) {
    isTemplateConnecting = value;
}

export function setExternalVariablesCache(value) {
    externalVariablesCache = value;
}

export function setPreferredChatGptTabId(value) {
    preferredChatGptTabId = value;
}

export function updateBackendConnectionState(partialState) {
    Object.assign(backendConnectionState, partialState);
}

export function getBackendStatus() {
    return {
        ...backendConnectionState,
        isConnecting,
        isTemplateConnecting
    };
}

export function initStateFromStorage() {
    chrome.storage.session.get(['preferredChatGptTabId'], (res) => {
        if (typeof res.preferredChatGptTabId === 'number') {
            preferredChatGptTabId = res.preferredChatGptTabId;
        }
    });

    chrome.storage.local.get(['externalVariables'], (res) => {
        externalVariablesCache = res.externalVariables || {};
    });
}

export function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}