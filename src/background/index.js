import { KEEPALIVE_ALARM_NAME } from './constants.js';
import { registerMessageHandlers } from './message-handler.js';
import { connectTemplateWebSocket } from './ws-template.js';
import { connectWebSocket } from './ws-control.js';
import { initStateFromStorage, templateWs, ws } from './state.js';

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

initStateFromStorage();
registerMessageHandlers();

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

connectWebSocket();
connectTemplateWebSocket();
