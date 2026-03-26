import { showAudioBanner, refreshMapWithAudio } from './audio-banner.js';
import { renderBackendStatus } from './backend-status.js';
import { applyAutoUpdateMap } from './scan.js';
import { updateRecStepCount } from './recording/controls.js';
import * as state from './state.js';

export function registerSidepanelMessageListeners() {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'AUTO_UPDATE_MAP' && request.map) {
            applyAutoUpdateMap(request.map);
        }

        if (request.action === 'BACKEND_STATUS_UPDATED' && request.state) {
            renderBackendStatus(request.state);
        }

        if (request.action === 'RECORD_USER_ACTION' && state.isRecording) {
            const { aiRef, text, selector, locator } = request.data;
            state.addRecordedStep({ aiRef, text, selector, locator: locator || null });
            updateRecStepCount();
        }

        if (request.action === 'AUDIO_DETECTED') {
            showAudioBanner(request);
            if (state.lastAnalysisData) {
                refreshMapWithAudio(request);
            }
        }
    });
}